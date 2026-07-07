/**
 * Supplies active Project__c records + resolved geographic address for the
 * Active Project Map LWC.
 *
 * Address resolution order for each project:
 *   1. Parent Opportunity -> Primary OpportunityContactRole -> Contact mailing address
 *   2. Fallback: Parent Opportunity -> Account billing address
 *
 * "Active" = Project_Stage__c is anything other than 'Archive'.
 */
public with sharing class ActiveProjectMapController {

    private static final String ARCHIVE_STAGE = 'Archive';

    @AuraEnabled(cacheable=true)
    public static List<ProjectMarker> getActiveProjects() {
        List<Project__c> projects = [
            SELECT Id, Name, Job_Number_Project__c, Project_Developer__c,
                   Project_Stage__c, Project_Start_Date__c, Project_Close_Date__c,
                   Smartsheet_Link_Project__c,
                   Production_Coordinator__r.Name, Lead_Carpenter_on_Project__r.Name,
                   Parent_Opportunity_of_Project__c
            FROM Project__c
            WHERE Project_Stage__c != :ARCHIVE_STAGE
            WITH SECURITY_ENFORCED
            ORDER BY Project_Start_Date__c DESC NULLS LAST
        ];

        // Collect parent opportunity ids to bulk-load address + amount data.
        Set<Id> oppIds = new Set<Id>();
        for (Project__c p : projects) {
            if (p.Parent_Opportunity_of_Project__c != null) {
                oppIds.add(p.Parent_Opportunity_of_Project__c);
            }
        }

        Map<Id, Opportunity> oppById = new Map<Id, Opportunity>();
        Map<Id, OpportunityContactRole> primaryRoleByOpp = new Map<Id, OpportunityContactRole>();

        if (!oppIds.isEmpty()) {
            oppById = new Map<Id, Opportunity>([
                SELECT Id, Amount,
                       Account.BillingStreet, Account.BillingCity, Account.BillingState,
                       Account.BillingPostalCode, Account.BillingCountry,
                       Account.BillingLatitude, Account.BillingLongitude
                FROM Opportunity
                WHERE Id IN :oppIds
            ]);

            for (OpportunityContactRole ocr : [
                SELECT OpportunityId,
                       Contact.MailingStreet, Contact.MailingCity, Contact.MailingState,
                       Contact.MailingPostalCode, Contact.MailingCountry,
                       Contact.MailingLatitude, Contact.MailingLongitude
                FROM OpportunityContactRole
                WHERE OpportunityId IN :oppIds AND IsPrimary = TRUE
            ]) {
                // First primary role wins if multiple somehow exist.
                if (!primaryRoleByOpp.containsKey(ocr.OpportunityId)) {
                    primaryRoleByOpp.put(ocr.OpportunityId, ocr);
                }
            }
        }

        List<ProjectMarker> markers = new List<ProjectMarker>();
        for (Project__c p : projects) {
            ProjectMarker m = new ProjectMarker();
            m.id = p.Id;
            m.recordUrl = '/' + p.Id;
            m.name = p.Name;
            m.jobNumber = p.Job_Number_Project__c;
            m.developer = p.Project_Developer__c;
            m.stage = p.Project_Stage__c;
            m.coordinator = (p.Production_Coordinator__r != null) ? p.Production_Coordinator__r.Name : null;
            m.leadCarpenter = (p.Lead_Carpenter_on_Project__r != null) ? p.Lead_Carpenter_on_Project__r.Name : null;
            m.smartsheetLink = p.Smartsheet_Link_Project__c;
            m.startDate = p.Project_Start_Date__c;
            m.closeDate = p.Project_Close_Date__c;

            Id oppId = p.Parent_Opportunity_of_Project__c;
            Opportunity opp = oppById.get(oppId);
            if (opp != null) {
                m.amount = opp.Amount;
            }

            applyAddress(m, primaryRoleByOpp.get(oppId), opp);
            markers.add(m);
        }
        return markers;
    }

    /**
     * Copies the best available address onto the marker: the primary contact's
     * mailing address when populated, otherwise the account's billing address.
     */
    private static void applyAddress(ProjectMarker m, OpportunityContactRole role, Opportunity opp) {
        Contact c = (role != null) ? role.Contact : null;
        if (c != null && isPopulated(c.MailingStreet, c.MailingCity, c.MailingLatitude)) {
            m.street = c.MailingStreet;
            m.city = c.MailingCity;
            m.state = c.MailingState;
            m.postalCode = c.MailingPostalCode;
            m.country = c.MailingCountry;
            m.latitude = c.MailingLatitude;
            m.longitude = c.MailingLongitude;
            return;
        }

        Account a = (opp != null) ? opp.Account : null;
        if (a != null && isPopulated(a.BillingStreet, a.BillingCity, a.BillingLatitude)) {
            m.street = a.BillingStreet;
            m.city = a.BillingCity;
            m.state = a.BillingState;
            m.postalCode = a.BillingPostalCode;
            m.country = a.BillingCountry;
            m.latitude = a.BillingLatitude;
            m.longitude = a.BillingLongitude;
        }
    }

    private static Boolean isPopulated(String street, String city, Double latitude) {
        return String.isNotBlank(street) || String.isNotBlank(city) || latitude != null;
    }

    /**
     * DTO consumed by the LWC. Coordinates are preferred by lightning-map;
     * when null the component falls back to geocoding the address string.
     */
    public class ProjectMarker {
        @AuraEnabled public Id id;
        @AuraEnabled public String recordUrl;
        @AuraEnabled public String name;
        @AuraEnabled public String jobNumber;
        @AuraEnabled public String developer;
        @AuraEnabled public String stage;
        @AuraEnabled public String coordinator;
        @AuraEnabled public String leadCarpenter;
        @AuraEnabled public String smartsheetLink;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date closeDate;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public String street;
        @AuraEnabled public String city;
        @AuraEnabled public String state;
        @AuraEnabled public String postalCode;
        @AuraEnabled public String country;
        @AuraEnabled public Double latitude;
        @AuraEnabled public Double longitude;
    }
}
