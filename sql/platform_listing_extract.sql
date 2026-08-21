-- Read-only validation extract for one BookingPal product.
-- Set this to a product.ID available in the target environment.
-- If the SQL client does not persist variables between statements, inline the
-- same product ID in place of @product_id in each query.
SET @product_id = 0;

-- Listing-state eligibility (verified 2026-07-29): product.State is a string enum.
-- 'Created' = live/active listings (the sync target). 'Final' = retired/archived,
-- 'Suspended' = paused, 'Initial' = abandoned, 'Incomplete' = onboarding drafts.
-- This per-product extract does not restrict by State; the sync runner should pull
-- State = 'Created' (optionally 'Incomplete' for pre-launch mapping). See
-- docs/LISTING_STATE.md. NOTE: product.State='Final' (retired) is unrelated to
-- product_text.State=3 ('Final' = finalized text) -- same word, opposite meaning.

-- 1. Core product and location
SELECT
    p.ID, p.AltID, p.SupplierID, p.Name, p.DisplayName, p.UseDisplayName,
    p.State, p.BpValidation, p.Room, p.LivingPlace, p.Bathroom, p.Toilet,
    p.Bed, p.Person, p.StandardPerson, p.Child, p.Infant,
    p.Latitude, p.Longitude, p.CheckInTime, p.CheckInToTime, p.CheckOutTime,
    p.Currency, p.Space, p.SpaceUnit, p.TaxNumber, p.Physicaladdress,
    p.DisplayAddress, p.PartofID, p.ParentID, p.linked_id, p.MultiUnit, p.ProductGroup,
    p.version AS sourceVersion,
    l.Name AS city, l.GName AS alternateCityName,
    l.AdminArea_lvl_1 AS region, l.Country, l.ZipCode, l.TimeZoneID
FROM product p
LEFT JOIN location l ON l.ID = p.LocationID
WHERE p.ID = @product_id;

-- 2. Preferred English listing text
-- Return the latest Final row when it exists; otherwise return the latest
-- Created row as evidence. isFinal must remain false for the fallback row so
-- Mapwise can show the text without treating it as channel-ready.
SELECT
    pt.Type, pt.Value, pt.Version, pt.State AS textState,
    CASE WHEN pt.State = 3 THEN 1 ELSE 0 END AS isFinal
FROM product_text pt
WHERE pt.ProductID = @product_id
  AND pt.Language = 'en'
  AND pt.State IN (2, 3)
  AND pt.Type IN ('Name', 'Description', 'ShortDescription', 'HouseRules')
  AND NOT EXISTS (
      SELECT 1
      FROM product_text preferred
      WHERE preferred.ProductID = pt.ProductID
        AND preferred.Language = pt.Language
        AND preferred.Type = pt.Type
        AND preferred.State IN (2, 3)
        AND (
            preferred.State > pt.State
            OR (
                preferred.State = pt.State
                AND preferred.Version > pt.Version
            )
        )
  )
ORDER BY pt.Type, pt.State DESC, pt.Version DESC;

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
-- Primary name/category resolution is attribute_display.AttributeCode, which matches
-- product_attribute.attribute_id directly (no CONCAT). Verified 2026-07-29: it resolves
-- ~99% of amenity rows on live listings, including the newer RMA/HAC codes (5000-6000
-- range) that are ABSENT from `attribute` via CONCAT(List, ID). `attribute` is kept as a
-- fallback and attribute_mapping (Type = 2) still supplies PCT property-type names. All
-- joins are LEFT JOINs so any unresolved code stays visible in the review queue.
SELECT
    pa.attribute_id, pa.Quantity, pa.options,
    ad.DisplayName AS displayName, ad.DisplayCategory AS displayCategory,
    am.Names AS mappedTypeNames, am.Type AS mappingType,
    a.List AS attributeGroup, a.ID AS attributeItem,
    a.Name AS attributeName, a.Definition
FROM product_attribute pa
LEFT JOIN attribute_display ad
    ON ad.AttributeCode = pa.attribute_id
LEFT JOIN (
    SELECT
        Code,
        Type,
        GROUP_CONCAT(DISTINCT Name ORDER BY Name SEPARATOR ' | ') AS Names
    FROM attribute_mapping
    WHERE Type = 2
      AND `ignore` = 0
    GROUP BY Code, Type
) am
    ON pa.attribute_id LIKE 'PCT%'
   AND am.Code = pa.attribute_id
LEFT JOIN attribute a
    ON pa.attribute_id = CONCAT(a.List, a.ID)
WHERE pa.product_id = @product_id
ORDER BY pa.attribute_id;

-- 5. Candidate child units for a multi-representation parent
-- Run the four validation queries above again for each returned child ID.
SELECT
    child.ID, child.AltID, child.Name, child.DisplayName,
    child.State, child.BpValidation,
    child.PartofID, child.ParentID, child.linked_id,
    child.MultiUnit, child.ProductGroup,
    child.Room, child.Bathroom, child.Bed, child.Person,
    child.version AS sourceVersion,
    CASE
        WHEN child.ParentID = @product_id THEN 'ParentID'
        WHEN child.PartofID = @product_id THEN 'PartofID'
        WHEN child.linked_id = @product_id THEN 'linked_id'
    END AS relationshipSource
FROM product child
WHERE child.ParentID = @product_id
   OR child.PartofID = @product_id
   OR child.linked_id = @product_id
ORDER BY child.ID;
