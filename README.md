# Active Project Map

A Lightning Web Component that plots all **active** `Project__c` records on a
geographic map with stage-colored pins, tooltips (job #, stage, amount), a
details panel, and click-to-open navigation to the project record.

"Active" means `Project_Stage__c` is anything other than **Archive**.

## What's in here

| Path | Purpose |
| --- | --- |
| `force-app/main/default/classes/ActiveProjectMapController.cls` | Apex controller — queries active projects and resolves each address. |
| `force-app/main/default/classes/ActiveProjectMapControllerTest.cls` | Test coverage (exclusion of Archive + address fallback). |
| `force-app/main/default/lwc/activeProjectMap/` | The LWC (map, legend, detail panel). |

## How it works

- Built on the base **`lightning-map`** component — no Google Maps API key,
  billing, or Remote Site Settings required. Colored pins use `lightning-map`'s
  SVG `mapIcon` support.
- **Address resolution** for each project:
  1. `Parent_Opportunity_of_Project__c` → **primary** `OpportunityContactRole` →
     Contact mailing address.
  2. Fallback → the Opportunity's Account **billing** address.
- **Size/amount** in the tooltip comes from the parent Opportunity's `Amount`.
- Coordinates (`Latitude`/`Longitude`) are preferred when present; otherwise the
  raw address string is passed to `lightning-map`, which geocodes it live.

## Recommended setup — stored geocoding (do this once)

For reliable placement of many pins, enable Salesforce's **free** automatic
geocoding so Contact/Account addresses carry stored coordinates:

1. **Setup → Data Integration Rules**.
2. Activate **Geocodes for Contact Mailing Address**.
3. Activate **Geocodes for Account Billing Address**.

Salesforce back-fills `MailingLatitude/Longitude` and
`BillingLatitude/Longitude` (usually within minutes). The controller reads these
automatically. Without them the component still works via live address
geocoding, which is slower and rate-limited past ~10–15 pins.

## Deploying

Requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).

```bash
# Authorize your sandbox/prod org (once)
sf org login web --alias myorg

# Deploy the Apex + LWC
sf project deploy start --source-dir force-app --target-org myorg

# Run the tests
sf apex run test --tests ActiveProjectMapControllerTest --result-format human --target-org myorg
```

Then add **Active Project Map** to a Lightning App Page, Home Page, or a custom
Tab via the Lightning App Builder.

## Assumptions worth confirming

- **`Project_Developer__c` is treated as a text/name field.** If it's actually a
  User lookup, change the SOQL in `getActiveProjects()` from
  `Project_Developer__c` to `Project_Developer__r.Name` (and update the DTO
  assignment).
- `Production_Coordinator__c` and `Lead_Carpenter_on_Project__c` are treated as
  **User lookups** (queried via `...__r.Name`), per your description.
- Currency is formatted as **USD**. Adjust `formatCurrency` in the LWC for
  multi-currency orgs.

## Possible enhancements

- Filter controls (by stage, developer, date range) above the map.
- Clustering when many pins overlap.
- Swap `lightning-map` for an embedded Leaflet map (via static resource) if you
  want richer popups or clustering beyond what the base component offers.
