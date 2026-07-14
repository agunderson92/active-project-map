# Active Project Map

A Lightning Web Component that plots all **active** `Project__c` records on a
geographic map with stage-colored pins, tooltips (job #, stage, amount), a
details panel, and click-to-open navigation to the project record.

"Active" means `Project_Stage__c` is anything other than **Archive**.

> **No Apex.** Data is fetched entirely through the **GraphQL wire adapter**
> (`lightning/uiGraphQLApi`), so this deploys to **Professional Edition** orgs,
> which do not allow custom Apex.

## What's in here

| Path | Purpose |
| --- | --- |
| `force-app/main/default/lwc/activeProjectMap/` | The LWC — GraphQL data, map, filters, legend, and detail panel. |

## How it works

- Built on the base **`lightning-map`** component — no Google Maps API key,
  billing, or Remote Site Settings required. Colored pins use `lightning-map`'s
  SVG `mapIcon` support.
- **Data** comes from two GraphQL queries (no server code):
  1. Active projects + related users + parent Opportunity `Amount` + Account
     billing address.
  2. Each Opportunity's **primary `OpportunityContactRole` → Contact mailing
     address**, run separately so that if `OpportunityContactRole` isn't
     UI-API-accessible in the org, only that query fails and the component
     transparently falls back to the Account billing address.
- **Address resolution** per project: primary contact mailing address, else the
  Opportunity's Account billing address.
- **Size/amount** in the tooltip comes from the parent Opportunity's `Amount`.
- Coordinates (`Latitude`/`Longitude`) are preferred when present; otherwise the
  raw address string is passed to `lightning-map`, which geocodes it live.
- **Filter bar** above the map — filter by **stage** (multi-select), **developer**,
  and **project start date range**. Filtering is client-side over the loaded set,
  so it's instant and shows a live "X of Y" result count.

## Recommended setup — stored geocoding (do this once)

For reliable placement of many pins, enable Salesforce's **free** automatic
geocoding so Contact/Account addresses carry stored coordinates:

1. **Setup → Data Integration Rules**.
2. Activate **Geocodes for Contact Mailing Address**.
3. Activate **Geocodes for Account Billing Address**.

Salesforce back-fills `MailingLatitude/Longitude` and
`BillingLatitude/Longitude` (usually within minutes). The component reads these
automatically. Without them it still works via live address geocoding, which is
slower and rate-limited past ~10–15 pins.

## Deploying

Requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).

```bash
# Authorize your sandbox/prod org (once)
sf org login web --alias myorg

# Deploy the LWC (no Apex — Professional Edition friendly)
sf project deploy start --source-dir force-app --target-org myorg
```

Then add **Active Project Map** to a Lightning App Page, Home Page, or a custom
Tab via the Lightning App Builder.

## Assumptions worth confirming

- `Project_Developer__c`, `Production_Coordinator__c`, and
  `Lead_Carpenter_on_Project__c` are all treated as **User lookups** (queried via
  `...__r.Name`).
- Currency is formatted as **USD**. Adjust `formatCurrency` in the LWC for
  multi-currency orgs.
- The GraphQL queries request up to **250** projects/opportunities. Raise the
  `first:` limits in `activeProjectMap.js` if the client runs more.

## Possible enhancements

- Clustering when many pins overlap.
- Swap `lightning-map` for an embedded Leaflet map (via static resource) if you
  want richer popups or clustering beyond what the base component offers.
