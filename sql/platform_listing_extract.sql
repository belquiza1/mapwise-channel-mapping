-- Read-only validation extract for one BookingPal product.
-- Set this to a product.ID available in the target environment.
SET @product_id = 1335577872;

-- 1. Core product and location
SELECT
    p.ID, p.AltID, p.SupplierID, p.Name, p.DisplayName, p.UseDisplayName,
    p.State, p.BpValidation, p.Room, p.LivingPlace, p.Bathroom, p.Toilet,
    p.Bed, p.Person, p.StandardPerson, p.Child, p.Infant,
    p.Latitude, p.Longitude, p.CheckInTime, p.CheckInToTime, p.CheckOutTime,
    p.Currency, p.Space, p.SpaceUnit, p.TaxNumber, p.Physicaladdress,
    p.DisplayAddress, p.PartofID, p.ParentID, p.MultiUnit, p.ProductGroup,
    p.version AS sourceVersion,
    l.Name AS city, l.GName AS alternateCityName,
    l.AdminArea_lvl_1 AS region, l.Country, l.ZipCode, l.TimeZoneID
FROM product p
LEFT JOIN location l ON l.ID = p.LocationID
WHERE p.ID = @product_id;

-- 2. Final English listing text
SELECT Type, Value, Version
FROM product_text
WHERE ProductID = @product_id
  AND Language = 'en'
  AND State = 3
  AND Type IN ('Name', 'Description', 'ShortDescription', 'HouseRules')
ORDER BY Type;

-- 3. Bedroom and bed configuration
SELECT
    pb.ID AS bedroomID, pb.Type AS roomType, pb.Beds, pb.Guests,
    pb.PrivateBathroom, pbb.BedType, pbb.BedCount
FROM product_bedroom pb
LEFT JOIN product_bedroom_bed pbb
    ON pbb.ProductID = pb.ProductID
   AND pbb.BedroomID = pb.ID
WHERE pb.ProductID = @product_id
ORDER BY pb.ID, pbb.ID;

-- 4. Property type, amenities, and policies
SELECT
    pa.attribute_id, pa.Quantity, pa.options,
    am.Name AS mappedTypeName, am.Type AS mappingType,
    a.List AS attributeGroup, a.ID AS attributeItem,
    a.Name AS attributeName, a.Definition
FROM product_attribute pa
LEFT JOIN attribute_mapping am
    ON am.Code = pa.attribute_id
   AND am.Type = 2
   AND am.ignore = 0
LEFT JOIN attribute a
    ON pa.attribute_id = CONCAT(a.List, a.ID)
WHERE pa.product_id = @product_id
ORDER BY pa.attribute_id;