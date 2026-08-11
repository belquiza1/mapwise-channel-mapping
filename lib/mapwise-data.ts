export type Status = "approved" | "review" | "rejected";
export type MappingRow = { id:number; category:string; supplier:string; channel:string; target:string; confidence:number; status:Status; note?:string; suggested?:string; options?:string[]; gate1?:boolean; gate2?:"pass"|"review"|"block"|"n/a" };
export type ChannelStatus = { channel:string; onChannel:boolean; channelState?:string|null; portalState?:string|null; reviewStatus?:string|null; rejectedReason?:string|null };
export type ImportedSample = { name:string; id:string; kind:string; rooms:number; beds:number; guests:number; space:string; propertyType:string; rows:MappingRow[]; sourceVersion?:string; syncedAt?:string; recordKind?:"supplier"|"platform"; channels?:ChannelStatus[] };

type Bed = { bedType?:string; count?:number };
type Bedroom = { beds?:Bed[]; type?:string; privateBathroom?:boolean };
type ParkingPolicy = { parkingAvailable?:boolean; parkingCharge?:string; parkingLocation?:string };
type InternetPolicy = { internetAvailable?:boolean };
type PetPolicy = { petsAllowed?:string };
type PolicyShape = { parkingPolicy?:ParkingPolicy; internetPolicy?:InternetPolicy; petPolicy?:PetPolicy };
export type ProductData = {
  id:number; altId?:string; supplierId?:number; name:string; displayName?:string;
  bedrooms:number; bathrooms:number; maxGuests:number; maxAdults?:number; maxChildren?:number; maxInfants?:number;
  latitude?:number; longitude?:number; propertyType?:string;
  bedroomConfiguration?:{bedrooms?:Bedroom[]}; checkInTime?:string; checkInEndTime?:string; checkOutTime?:string;
  currency?:string; policy?:Record<string,unknown>; location?:Record<string,unknown>; taxNumber?:string; ownerInfo?:Record<string,unknown>;
  texts?:Record<string,unknown>; space?:number; spaceUnit?:string;
};

/**
 * Thrown when a pasted response fails structural validation. These messages are
 * safe to surface to the operator. Any other error type must NOT be echoed back
 * to the client (it may carry internal DB/SQL detail).
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseProductResponse(value: unknown): { response:Record<string,unknown>; data:ProductData } {
  if (!value || typeof value !== "object") throw new ValidationError("Response must be a JSON object.");
  const response = value as Record<string,unknown>;
  if (response.isError !== false || response.code !== 200) throw new ValidationError("Paste a successful Supplier API response with isError=false and code=200.");
  if (!response.data || typeof response.data !== "object") throw new ValidationError("The response does not contain a product data object.");
  const data = response.data as ProductData;
  if (!Number.isInteger(data.id) || !data.name || !Number.isFinite(data.bedrooms) || !Number.isFinite(data.bathrooms) || !Number.isFinite(data.maxGuests)) {
    throw new ValidationError("This is not a Product Detail response. Product id, name, bedrooms, bathrooms, and maxGuests are required.");
  }
  return { response, data };
}

export function buildImportedSample(data: ProductData): ImportedSample {
  const bedrooms = data.bedroomConfiguration?.bedrooms ?? [];
  const bedEntries = bedrooms.flatMap(room => room.beds ?? []);
  const totalBeds = bedEntries.reduce((sum,bed)=>sum + (Number(bed.count)||0),0);
  const bedCodes = Array.from(new Set(bedEntries.map(b=>b.bedType).filter(Boolean))).join(" / ") || "No bed codes";
  const configuredBedrooms = bedrooms.filter(room=>room.type === "bedroom").length;
  const privateBathrooms = bedrooms.filter(room=>room.privateBathroom).length;
  const childLimit = Number(data.maxChildren ?? 0), infantLimit = Number(data.maxInfants ?? 0), adultLimit = Number(data.maxAdults ?? data.maxGuests);
  const occupancyValid = data.maxGuests >= adultLimit && data.maxGuests <= adultLimit + childLimit + infantLimit && childLimit < data.maxGuests && infantLimit < data.maxGuests;
  const roomValid = configuredBedrooms === data.bedrooms;
  const bathroomValid = privateBathrooms <= data.bathrooms;
  const propertyType = data.propertyType || "Not provided";
  const policy = data.policy as PolicyShape | undefined;
  const parking = policy?.parkingPolicy;
  const internet = policy?.internetPolicy;
  const pets = policy?.petPolicy;
  let id = 1000;
  const rows: MappingRow[] = [
    {id:id++,category:"Property",supplier:`${data.displayName || data.name} / ${propertyType}`,channel:"Booking.com",target:"Catalog type mapping required",confidence:60,status:"review",note:`Confirm ${propertyType} against the Booking.com property catalog.`},
    {id:id++,category:"Property",supplier:`${data.displayName || data.name} / ${propertyType}`,channel:"Vrbo",target:"Catalog type mapping required",confidence:60,status:"review",note:`Confirm ${propertyType} against the Vrbo property catalog.`},
    {id:id++,category:"Property",supplier:`${data.displayName || data.name} / ${propertyType}`,channel:"Expedia",target:"Catalog type mapping required",confidence:60,status:"review",note:`Confirm ${propertyType} against the Expedia property catalog.`},
    {id:id++,category:"Room & beds",supplier:`bedrooms=${data.bedrooms} / configured=${configuredBedrooms}`,channel:"Booking.com",target:roomValid?`${data.bedrooms} bedrooms confirmed`:"Correct bedroom configuration",confidence:roomValid?98:10,status:roomValid?"approved":"rejected",note:roomValid?"Bedroom count matches the configuration.":"Bedroom count does not match bedroomConfiguration."},
    {id:id++,category:"Room & beds",supplier:`${totalBeds} beds / ${bedCodes}`,channel:"Vrbo",target:"Bed catalog lookup required",confidence:65,status:"review",note:"Confirm every RMA bed code and its sleeping capacity."},
    {id:id++,category:"Room & beds",supplier:`bathrooms=${data.bathrooms} / privateBathroom flags=${privateBathrooms}`,channel:"Expedia",target:bathroomValid?"Bathroom count accepted":"Confirm bathroom count",confidence:bathroomValid?90:20,status:bathroomValid?"approved":"rejected",note:bathroomValid?"Private-bathroom flags do not exceed the total bathroom count.":"More bedrooms are marked privateBathroom than the property bathroom total."},
    {id:id++,category:"Validation",supplier:`maxGuests=${data.maxGuests} / adults=${adultLimit} / children=${childLimit} / infants=${infantLimit}`,channel:"Booking.com",target:occupancyValid?"Occupancy limits accepted":"Correct occupancy limits",confidence:occupancyValid?98:10,status:occupancyValid?"approved":"rejected",note:occupancyValid?"Occupancy fields pass the Supplier API relationship checks.":"Occupancy fields conflict with maxGuests."},
    {id:id++,category:"Amenities & policies",supplier:`Internet available=${Boolean(internet?.internetAvailable)}`,channel:"Booking.com",target:internet?.internetAvailable?"Internet available":"No internet",confidence:90,status:"review",note:"Confirm access type and whether a fee applies."},
    {id:id++,category:"Amenities & policies",supplier:`Parking=${parking?.parkingAvailable ? `${parking.parkingCharge || "charge unknown"} / ${parking.parkingLocation || "location unknown"}` : "not available"}`,channel:"Vrbo",target:parking?.parkingAvailable?"Parking available":"No parking",confidence:92,status:"review",note:"Confirm channel-supported parking labels and reservation requirements."},
    {id:id++,category:"Amenities & policies",supplier:`Pets=${pets?.petsAllowed || "not provided"}`,channel:"Expedia",target:pets?.petsAllowed === "notAllowed"?"Pets not allowed":"Pet policy review required",confidence:95,status:pets?.petsAllowed?"approved":"review"},
    {id:id++,category:"Validation",supplier:`Check-in ${data.checkInTime || "N/A"}-${data.checkInEndTime || "N/A"} / checkout ${data.checkOutTime || "N/A"}`,channel:"Vrbo",target:"Time policy review",confidence:90,status:"review",note:"Confirm timezone and late-arrival handling."},
    {id:id++,category:"Validation",supplier:`Tax number ${data.taxNumber ? "retained internally" : "missing"}`,channel:"Expedia",target:data.taxNumber?"Compliance field present":"Add compliance data",confidence:data.taxNumber?98:35,status:data.taxNumber?"approved":"review",note:"Tax number is stored in the restricted internal record and not displayed in mapping evidence."}
  ];
  return {name:data.displayName || data.name,id:String(data.id),kind:"API import",rooms:data.bedrooms,beds:totalBeds,guests:data.maxGuests,space:data.space && data.spaceUnit?`${data.space} ${data.spaceUnit}`:"Not provided",propertyType,rows};
}
