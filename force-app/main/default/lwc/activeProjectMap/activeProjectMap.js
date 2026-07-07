import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getActiveProjects from '@salesforce/apex/ActiveProjectMapController.getActiveProjects';

// Stage -> badge color. Order also drives the legend.
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

export default class ActiveProjectMap extends NavigationMixin(LightningElement) {
    @track markers = [];
    @track selected;
    projects = [];
    error;
    isLoading = true;

    @wire(getActiveProjects)
    wiredProjects({ data, error }) {
        this.isLoading = false;
        if (data) {
            this.projects = data;
            this.markers = data
                .map((p) => this.toMapMarker(p))
                .filter((m) => m !== null);
            this.error = undefined;
        } else if (error) {
            this.error = this.reduceError(error);
            this.markers = [];
        }
    }

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

    get hasMarkers() {
        return this.markers.length > 0;
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

    reduceError(error) {
        if (Array.isArray(error.body)) {
            return error.body.map((e) => e.message).join(', ');
        } else if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        return 'Unknown error loading projects.';
    }
}
