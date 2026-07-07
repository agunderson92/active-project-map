@IsTest
private class ActiveProjectMapControllerTest {

    @TestSetup
    static void setup() {
        Account acct = new Account(
            Name = 'Test Account',
            BillingStreet = '1 Market St',
            BillingCity = 'San Francisco',
            BillingState = 'CA',
            BillingPostalCode = '94105',
            BillingCountry = 'USA'
        );
        insert acct;

        Contact con = new Contact(
            LastName = 'Primary',
            AccountId = acct.Id,
            MailingStreet = '500 Howard St',
            MailingCity = 'San Francisco',
            MailingState = 'CA',
            MailingPostalCode = '94105',
            MailingCountry = 'USA'
        );
        insert con;

        // Opportunity that resolves address from its primary contact.
        Opportunity oppWithContact = new Opportunity(
            Name = 'Opp With Contact',
            AccountId = acct.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 125000
        );
        // Opportunity with no primary contact -> should fall back to Account billing.
        Opportunity oppNoContact = new Opportunity(
            Name = 'Opp No Contact',
            AccountId = acct.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 90000
        );
        insert new List<Opportunity>{ oppWithContact, oppNoContact };

        insert new OpportunityContactRole(
            OpportunityId = oppWithContact.Id,
            ContactId = con.Id,
            IsPrimary = true,
            Role = 'Decision Maker'
        );

        insert new List<Project__c>{
            new Project__c(
                Name = 'Active - Contact Address',
                Project_Stage__c = 'Active',
                Project_Start_Date__c = Date.today(),
                Parent_Opportunity_of_Project__c = oppWithContact.Id
            ),
            new Project__c(
                Name = 'Active - Account Fallback',
                Project_Stage__c = 'Pre-Project',
                Project_Start_Date__c = Date.today().addDays(-5),
                Parent_Opportunity_of_Project__c = oppNoContact.Id
            ),
            new Project__c(
                Name = 'Archived - Excluded',
                Project_Stage__c = 'Archive',
                Parent_Opportunity_of_Project__c = oppWithContact.Id
            )
        };
    }

    @IsTest
    static void archivedProjectsAreExcluded() {
        Test.startTest();
        List<ActiveProjectMapController.ProjectMarker> markers =
            ActiveProjectMapController.getActiveProjects();
        Test.stopTest();

        System.assertEquals(2, markers.size(), 'Archived projects should be excluded');
        for (ActiveProjectMapController.ProjectMarker m : markers) {
            System.assertNotEquals('Archive', m.stage, 'No archived stage expected');
        }
    }

    @IsTest
    static void resolvesContactAddressThenAccountFallback() {
        List<ActiveProjectMapController.ProjectMarker> markers =
            ActiveProjectMapController.getActiveProjects();

        Map<String, ActiveProjectMapController.ProjectMarker> byName =
            new Map<String, ActiveProjectMapController.ProjectMarker>();
        for (ActiveProjectMapController.ProjectMarker m : markers) {
            byName.put(m.name, m);
        }

        ActiveProjectMapController.ProjectMarker contactBased = byName.get('Active - Contact Address');
        System.assertEquals('500 Howard St', contactBased.street, 'Should use primary contact mailing street');
        System.assertEquals(125000, contactBased.amount, 'Amount should come from parent opportunity');

        ActiveProjectMapController.ProjectMarker fallback = byName.get('Active - Account Fallback');
        System.assertEquals('1 Market St', fallback.street, 'Should fall back to account billing street');
        System.assertEquals(90000, fallback.amount, 'Amount should come from parent opportunity');
    }
}
