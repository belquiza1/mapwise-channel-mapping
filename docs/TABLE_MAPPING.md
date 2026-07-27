# BookingPal Platform Table Mapping

## Product

| Mapwise field | Source |
|---|---|
| Listing ID | `product.ID` |
| PMS listing ID | `product.AltID` |
| Property manager | `product.SupplierID` |
| Name | `product.Name` |
| Display name | `product.DisplayName` |
| Use display name | `product.UseDisplayName` |
| Bedrooms | `product.Room` |
| Living rooms | `product.LivingPlace` |
| Bathrooms | `product.Bathroom` |
| Toilets | `product.Toilet` |
| Reported beds | `product.Bed` |
| Maximum guests | `product.Person` |
| Standard persons | `product.StandardPerson` |
| Children | `product.Child` |
| Infants | `product.Infant` |
| Coordinates | `product.Latitude`, `product.Longitude` |
| Check-in window | `product.CheckInTime`, `product.CheckInToTime` |
| Check-out | `product.CheckOutTime` |
| Currency | `product.Currency` |
| Space | `product.Space`, `product.SpaceUnit` |
| Tax number | `product.TaxNumber` |
| Street | `product.Physicaladdress` |
| Parent/unit structure | `product.PartofID`, `product.ParentID`, `product.MultiUnit`, `product.ProductGroup` |
| Source version | `product.version` |

## Text

Join `product_text.ProductID = product.ID`. Use final English content with `Language = 'en'`, `State = 3`, and `Type IN ('Name', 'Description', 'ShortDescription', 'HouseRules')`. The value is `product_text.Value`.

## Bedrooms and beds

```text
product_bedroom.ProductID = product.ID
product_bedroom_bed.ProductID = product.ID
product_bedroom_bed.BedroomID = product_bedroom.ID
```

`product_bedroom_bed.BedType` contains RMA codes and `BedCount` contains quantity. Compare the configuration with `product.Room` and `product.Bed`.

## Property type

```text
product_attribute.product_id = product.ID
product_attribute.attribute_id = attribute_mapping.Code
attribute_mapping.Type = 2
```

PCT codes represent property/structure type. `attribute_mapping.Name` provides the human-readable label.

## Policies and amenities

`product_attribute.attribute_id` is expected to resolve through:

```sql
product_attribute.attribute_id = CONCAT(attribute.List, attribute.ID)
```

`attribute.List` is the three-letter group. `product_attribute.options` contains JSON options such as charge, location, or reservation requirements. Validate this join using production sample rows before treating it as universal.

## Location

Join `product.LocationID = location.ID`.

| Field | Source |
|---|---|
| City | `location.Name` or `location.GName` |
| Region/state | `location.AdminArea_lvl_1` |
| Country | `location.Country` |
| Postal code | `location.ZipCode` |
| Time zone reference | `location.TimeZoneID` |
| Street | `product.Physicaladdress` |