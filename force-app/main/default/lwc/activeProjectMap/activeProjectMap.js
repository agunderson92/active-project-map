import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { gql, graphql } from 'lightning/uiGraphQLApi';

// UI API returns each scalar wrapped as { value }.
const val = (field) => (field ? field.value : null);

// Query 1 — active projects, related users, parent Opportunity amount + Account
// billing address. This always works (no OpportunityContactRole dependency).
const PROJECTS_QUERY = gql`
    query ActiveProjects {
        uiapi {
            query {
                Project__c(
                    where: { Project_Stage__c: { ne: "Archive" } }
                    first: 250
                    orderBy: { Project_Start_Date__c: { order: DESC } }
                ) {
                    edges {
                        node {
                            Id
                            Name { value }
                            Job_Number_Project__c { value }
                            Project_Stage__c { value }
                            Project_Start_Date__c { value }
                            Project_Close_Date__c { value }
                            Smartsheet_Link_Project__c { value }
                            Project_Developer__r { Name { value } }
                            Production_Coordinator__r { Name { value } }
                            Lead_Carpenter_on_Project__r { Name { value } }
                            Parent_Opportunity_of_Project__r {
                                Id
                                Amount { value }
                                Account {
                                    BillingStreet { value }
                                    BillingCity { value }
                                    BillingState { value }
                                    BillingPostalCode { value }
                                    BillingCountry { value }
                                    BillingLatitude { value }
                                    BillingLongitude { value }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

// Query 2 — primary contact mailing address per Opportunity. Runs separately so
// that if OpportunityContactRole is not UI-API-accessible in this org, only this
// query fails and we transparently fall back to the Account billing address.
const ROLES_QUERY = gql`
    query PrimaryContactAddresses($oppIds: [ID]) {
        uiapi {
            query {
                Opportunity(where: { Id: { in: $oppIds } }, first: 250) {
                    edges {
                        node {
                            Id
                            OpportunityContactRoles(
                                where: { IsPrimary: { eq: true } }
                                first: 1
                            ) {
                                edges {
                                    node {
                                        Contact {
                                            MailingStreet { value }
                                            MailingCity { value }
                                            MailingState { value }
                                            MailingPostalCode { value }
                                            MailingCountry { value }
                                            MailingLatitude { value }
                                            MailingLongitude { value }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

// Stage -> badge color. Order also drives the legend and stage filter.
const STAGE_COLORS = {
    'PC Review': '#7f8de1',
    'Signed & Returned': '#5867e8',
    'Smartsheet Build': '#3496d6',
    'Pre-Project': '#16a5a5',
    Active: '#2e844a',
    'Punch List': '#dd7a01',
    'Final Walkthrough': '#ca1b21'
};
const DEFAULT_COLOR = '#706e6b';
const ALL = '';

export default class ActiveProjectMap extends NavigationMixin(LightningElement) {
    @track selected;
    @track projects = [];
    error;
    isLoading = true;

    // Raw GraphQL results, merged into `projects` by buildProjects().
    projectEdges;
    contactAddressByOpp = {};

    // Filter state
    selectedStages = [];
    selectedDeveloper = ALL;
    startFrom = null;
    startTo = null;

    // ---- Data (GraphQL, no Apex) ----------------------------------------

    @wire(graphql, { query: PROJECTS_QUERY })
    handleProjectsResult({ data, errors }) {
        this.isLoading = false;
        if (errors) {
            this.error = this.reduceError(errors);
            this.projectEdges = [];
        } else if (data) {
            this.error = undefined;
            this.projectEdges = data.uiapi.query.Project__c.edges;
        }
        this.buildProjects();
    }

    get oppIds() {
        if (!this.projectEdges) {
            return [];
        }
        const ids = this.projectEdges
            .map((e) => {
                const opp = e.node.Parent_Opportunity_of_Project__r;
                return opp ? opp.Id : null;
            })
            .filter(Boolean);
        return [...new Set(ids)];
    }

    get roleVariables() {
        return { oppIds: this.oppIds };
    }

    @wire(graphql, { query: ROLES_QUERY, variables: '$roleVariables' })
    handleRolesResult({ data, errors }) {
        // Errors here (e.g. OpportunityContactRole not UI-API-accessible) are
        // non-fatal: we simply keep the Account billing fallback.
        if (errors || !data) {
            return;
        }
        const map = {};
        const edges = data.uiapi.query.Opportunity.edges || [];
        for (const e of edges) {
            const roleEdges =
                (e.node.OpportunityContactRoles &&
                    e.node.OpportunityContactRoles.edges) ||
                [];
            if (roleEdges.length && roleEdges[0].node.Contact) {
                const c = roleEdges[0].node.Contact;
                map[e.node.Id] = {
                    street: val(c.MailingStreet),
                    city: val(c.MailingCity),
                    state: val(c.MailingState),
                    postalCode: val(c.MailingPostalCode),
                    country: val(c.MailingCountry),
                    latitude: val(c.MailingLatitude),
                    longitude: val(c.MailingLongitude)
                };
            }
        }
        this.contactAddressByOpp = map;
        this.buildProjects();
    }

    // Merge the two queries into the flat project shape the UI expects.
    buildProjects() {
        if (!this.projectEdges) {
            return;
        }
        const roleMap = this.contactAddressByOpp || {};
        this.projects = this.projectEdges.map((edge) => {
            const n = edge.node;
            const opp = n.Parent_Opportunity_of_Project__r;
            const acct = opp ? opp.Account : null;
            const oppId = opp ? opp.Id : null;

            const addr = this.resolveAddress(
                oppId ? roleMap[oppId] : null,
                acct
            );

            return {
                id: n.Id,
                recordUrl: '/' + n.Id,
                name: val(n.Name),
                jobNumber: val(n.Job_Number_Project__c),
                developer: n.Project_Developer__r
                    ? val(n.Project_Developer__r.Name)
                    : null,
                stage: val(n.Project_Stage__c),
                coordinator: n.Production_Coordinator__r
                    ? val(n.Production_Coordinator__r.Name)
                    : null,
                leadCarpenter: n.Lead_Carpenter_on_Project__r
                    ? val(n.Lead_Carpenter_on_Project__r.Name)
                    : null,
                smartsheetLink: val(n.Smartsheet_Link_Project__c),
                startDate: val(n.Project_Start_Date__c),
                closeDate: val(n.Project_Close_Date__c),
                amount: opp ? val(opp.Amount) : null,
                ...addr
            };
        });
    }

    // Prefer the primary contact's mailing address; fall back to Account billing.
    resolveAddress(contactAddr, acct) {
        const populated = (a) =>
            a && (a.street || a.city || a.latitude != null);

        if (populated(contactAddr)) {
            return contactAddr;
        }
        if (acct) {
            const billing = {
                street: val(acct.BillingStreet),
                city: val(acct.BillingCity),
                state: val(acct.BillingState),
                postalCode: val(acct.BillingPostalCode),
                country: val(acct.BillingCountry),
                latitude: val(acct.BillingLatitude),
                longitude: val(acct.BillingLongitude)
            };
            if (populated(billing)) {
                return billing;
            }
        }
        return {
            street: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
            latitude: null,
            longitude: null
        };
    }

    // ---- Filtering -------------------------------------------------------

    get filteredProjects() {
        const stages = this.selectedStages;
        const dev = this.selectedDeveloper;
        const from = this.startFrom;
        const to = this.startTo;

        return this.projects.filter((p) => {
            if (stages.length && !stages.includes(p.stage)) {
                return false;
            }
            if (dev && p.developer !== dev) {
                return false;
            }
            if (from || to) {
                if (!p.startDate) return false; // no date can't match a bounded range
                if (from && p.startDate < from) return false;
                if (to && p.startDate > to) return false;
            }
            return true;
        });
    }

    get markers() {
        return this.filteredProjects
            .map((p) => this.toMapMarker(p))
            .filter((m) => m !== null);
    }

    get hasMarkers() {
        return this.markers.length > 0;
    }

    get hasProjects() {
        return this.projects.length > 0;
    }

    get resultCount() {
        const shown = this.filteredProjects.length;
        return `${shown} of ${this.projects.length} active project${
            this.projects.length === 1 ? '' : 's'
        }`;
    }

    get stageOptions() {
        return Object.keys(STAGE_COLORS).map((stage) => ({
            label: stage,
            value: stage
        }));
    }

    get developerOptions() {
        const names = [
            ...new Set(
                this.projects
                    .map((p) => p.developer)
                    .filter((d) => d)
            )
        ].sort();
        return [
            { label: 'All developers', value: ALL },
            ...names.map((n) => ({ label: n, value: n }))
        ];
    }

    get filtersActive() {
        return (
            this.selectedStages.length > 0 ||
            this.selectedDeveloper !== ALL ||
            !!this.startFrom ||
            !!this.startTo
        );
    }

    handleStageChange(event) {
        this.selectedStages = [...event.detail.value];
        this.clearSelectionIfHidden();
    }

    handleDeveloperChange(event) {
        this.selectedDeveloper = event.detail.value;
        this.clearSelectionIfHidden();
    }

    handleStartFromChange(event) {
        this.startFrom = event.detail.value || null;
        this.clearSelectionIfHidden();
    }

    handleStartToChange(event) {
        this.startTo = event.detail.value || null;
        this.clearSelectionIfHidden();
    }

    handleClearFilters() {
        this.selectedStages = [];
        this.selectedDeveloper = ALL;
        this.startFrom = null;
        this.startTo = null;
    }

    // Drop the detail panel if the selected project is no longer visible.
    clearSelectionIfHidden() {
        if (
            this.selected &&
            !this.filteredProjects.some((p) => p.id === this.selected.id)
        ) {
            this.selected = undefined;
        }
    }

    // ---- Markers & detail ------------------------------------------------

    toMapMarker(p) {
        const hasCoords = p.latitude != null && p.longitude != null;
        const hasAddress = p.street || p.city || p.postalCode;
        // Skip records we cannot place on the map at all.
        if (!hasCoords && !hasAddress) {
            return null;
        }
        const location = hasCoords
            ? { Latitude: p.latitude, Longitude: p.longitude }
            : {
                  Street: p.street,
                  City: p.city,
                  State: p.state,
                  PostalCode: p.postalCode,
                  Country: p.country
              };
        return {
            value: p.id,
            location,
            title: p.name,
            description: this.markerDescription(p),
            mapIcon: {
                path: 'M12 0C7 0 3 4 3 9c0 6 9 15 9 15s9-9 9-15c0-5-4-9-9-9z',
                fillColor: STAGE_COLORS[p.stage] || DEFAULT_COLOR,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 1,
                scale: 1.4,
                anchor: { x: 12, y: 24 }
            }
        };
    }

    markerDescription(p) {
        const parts = [];
        if (p.jobNumber) parts.push(`Job #${p.jobNumber}`);
        if (p.stage) parts.push(p.stage);
        if (p.amount != null) parts.push(this.formatCurrency(p.amount));
        return parts.join(' • ');
    }

    get legend() {
        return Object.keys(STAGE_COLORS).map((stage) => ({
            stage,
            style: `background-color:${STAGE_COLORS[stage]};`
        }));
    }

    handleMarkerSelect(event) {
        const id = event.detail.selectedMarkerValue;
        const p = this.projects.find((x) => x.id === id);
        if (!p) {
            this.selected = undefined;
            return;
        }
        this.selected = {
            ...p,
            amountLabel: p.amount != null ? this.formatCurrency(p.amount) : '—',
            startLabel: this.formatDate(p.startDate),
            closeLabel: this.formatDate(p.closeDate),
            badgeStyle: `background-color:${STAGE_COLORS[p.stage] || DEFAULT_COLOR};`,
            addressLabel: this.formatAddress(p)
        };
    }

    handleOpenSmartsheet() {
        if (this.selected && this.selected.smartsheetLink) {
            window.open(this.selected.smartsheetLink, '_blank', 'noopener');
        }
    }

    handleOpenRecord() {
        if (!this.selected) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.selected.id,
                objectApiName: 'Project__c',
                actionName: 'view'
            }
        });
    }

    // ---- Formatting helpers ---------------------------------------------

    formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(value);
    }

    formatDate(value) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(new Date(value));
    }

    formatAddress(p) {
        return [p.street, p.city, p.state, p.postalCode]
            .filter((x) => x)
            .join(', ');
    }

    reduceError(errors) {
        if (Array.isArray(errors)) {
            return errors
                .map((e) => (e && e.message) || JSON.stringify(e))
                .join(', ');
        }
        if (errors && errors.body && errors.body.message) {
            return errors.body.message;
        }
        return 'Unknown error loading projects.';
    }
}
