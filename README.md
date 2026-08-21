# Mapwise Channel Mapping

Mapwise is an internal BookingPal operations tool for reviewing listing data and mapping it to Booking.com, Vrbo, and Expedia. It combines source-data validation, channel-specific mapping decisions, exceptions, approvals, and an audit trail.

## Current state

The repository contains a working UI prototype with:

- BookingPal-domain authentication
- Property, room/bed, amenity/policy, and validation review
- Mapping approvals and exception tracking
- Durable D1 storage for imported records, decisions, and audit events
- A temporary Supplier API JSON importer

The importer is not the intended production data source. The next milestone is to replace it with a read-only listing sync from the BookingPal MySQL platform over VPN.

## Target architecture

```text
BookingPal MySQL (read-only, VPN)
        |
        v
Local or internal sync service
        |
        v
Mapwise normalized listing store
        |
        +--> Booking.com mapping review
        +--> Vrbo mapping review
        +--> Expedia mapping review
        |
        v
Approvals, exceptions, and audit history
```

Mapwise must never connect to MySQL from the browser or store a developer's personal database credentials.

## Local setup

Requirements: Node.js 22.13 or later and npm.

```bash
npm install
npm run build
```

macOS/Linux development:

```bash
npm run dev
```

Windows PowerShell development:

```powershell
$env:WRANGLER_LOG_PATH = ".wrangler/wrangler.log"
& ".\node_modules\.bin\vinext.cmd" dev
```

## Validation

```bash
npm test
```

The production build must pass before publishing. Database schema changes require a generated and reviewed Drizzle migration.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development handoff](docs/DEVELOPMENT_HANDOFF.md)
- [Platform table mapping](docs/TABLE_MAPPING.md)
- [Development backlog](docs/BACKLOG.md)
- [Platform listing extraction SQL](sql/platform_listing_extract.sql)

## Security

- Production access is restricted server-side to authenticated `@bookingpal.com` accounts.
- MySQL access must use a dedicated `SELECT`-only service account.
- Database and VPN credentials belong in local secret storage, never Git or browser code.
- Tax numbers, street addresses, owner details, and raw listing payloads are restricted internal data.
- The checked-in Sites configuration contains no production project identifier.

## Prototype

[Open the current Mapwise build](https://mapwise-channel-mapping.michelle244005.chatgpt.site)

The deployed build is a prototype and should not be described as a live MySQL or channel integration.