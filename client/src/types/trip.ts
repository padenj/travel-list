export interface Trip {
  id: string;
  familyId: string;
  name: string;
  description?: string;
  tripType?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripElement {
  id: string;
  tripId: string;
  elementType: 'flight' | 'hotel' | 'car_rental' | 'activity';
  name: string;
  bookingReference?: string;
  bookingUrl?: string;
  priceCash?: number;
  pricePoints?: number;
  loyaltyProgram?: string;
  totalCash?: number;
  totalPoints?: number;
  notes?: string;
  sortPosition: number;
  createdAt: string;
  updatedAt: string;
  legs?: FlightLeg[];
  hotelDetails?: HotelDetails;
  rooms?: LodgingRoom[];
  bookingId?: string | null;
  carRentalDetails?: CarRentalDetails;
  activityDetails?: ActivityDetails;
}

export interface FlightLeg {
  id: string;
  elementId: string;
  legOrder: number;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  airline?: string;
  flightNumber?: string;
  seatNumbers?: string;
  priceCash?: number;
  pricePoints?: number;
  loyaltyProgram?: string;
  confirmationNumber?: string;
  checkPriceUrl?: string;
  layoverMinutesAfter?: number;
  createdAt: string;
  updatedAt: string;
}

export type PropertyAmenity = 'breakfast' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type RoomAmenity = 'fridge' | 'microwave' | 'kitchenette' | 'jetted_tub' | 'balcony';

export interface HotelDetails {
  address: string | null;
  phone: string | null;
  website: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  destinationId: string | null;
  destinationName?: string | null;
  amenities?: PropertyAmenity[];
  otherAmenities?: string | null;
}
export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type Refundability = 'free' | 'partial' | 'nonrefundable';

export interface BedCount { type: BedType; count: number }

export interface LodgingRoom {
  id: string;
  elementId: string;
  position: number;
  roomType: RoomType | null;
  beds: BedCount[];
  description: string | null;
  amenities: RoomAmenity[];
  otherAmenities: string | null;
  travelerIds: string[];
}

export type RoomPayload = Partial<Omit<LodgingRoom, 'id' | 'elementId' | 'position'>>;

export interface BookingCoupon {
  id?: string;
  code: string;
  savingsCash: number | null;
  savingsPoints: number | null;
  notes: string | null;
}

export interface CarRentalDetails {
  elementId: string;
  rentalCompany?: string;
  carSize?: string;
  pickupLocation?: string;
  pickupDatetime?: string;
  returnLocation?: string;
  returnDatetime?: string;
  prepaidPrice?: number;
  atCounterPrice?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDetails {
  elementId: string;
  venue?: string;
  activityDatetime?: string;
  numTickets?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TripElementConfirmation {
  id: string;
  elementId: string;
  legId?: string;
  participantId?: string;
  confirmationNumber: string;
  label?: string;
  createdAt: string;
}

export interface TripLocation {
  id: string;
  tripId: string;
  name: string;
  orderPosition: number;
  createdAt: string;
}

export interface TripParticipant {
  id: string;
  tripId: string;
  userId?: string;
  displayName: string;
  createdAt: string;
}

export interface TripAttachment {
  id: string;
  elementId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
}

export interface FlightAutofillLookupInput {
  airlineCode: string;
  flightNumber: string;
  flightDate: string;
}

export interface FlightAutofillDetails {
  airlineCode: string;
  flightNumber: string;
  flightDate: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDatetime?: string;
  arrivalDatetime?: string;
  statusText?: string;
  sourceUrl: string;
}

export type PayAt = 'booking' | 'checkin';

export interface BookingMoneyFields {
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  advertisedRateCash?: number | null;
  advertisedRatePoints?: number | null;
  dueAtBookingCash?: number | null;
  dueAtBookingPoints?: number | null;
  dueLaterCash?: number | null;
  dueLaterNotes?: string | null;
  refundability?: Refundability | null;
  cancelBy?: string | null;
  cancellationPolicy?: string | null;
  payAt?: PayAt;
}

export interface Booking extends BookingMoneyFields {
  id: string;
  tripId: string;
  confirmationNumber: string | null;
  advertisedPriceCash: number | null;
  advertisedPricePoints: number | null;
  loyaltyProgram: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  elementIds: string[];
  travelerIds: string[];
  currentConfirmationNumber: string | null;
  actualTotalCash: number;
  actualTotalPoints: number;
  coupons?: BookingCoupon[];
}

export interface CreateBookingPayload extends BookingMoneyFields {
  confirmationNumber?: string | null;
  advertisedPriceCash?: number | null;
  advertisedPricePoints?: number | null;
  loyaltyProgram?: string | null;
  notes?: string | null;
  elementIds: string[];
  travelerIds: string[];
  coupons?: Omit<BookingCoupon, 'id'>[];
  firstTransaction?: FirstTransactionPayload;
}

export type StayBookingPayload = Omit<CreateBookingPayload, 'elementIds' | 'travelerIds' | 'firstTransaction'>;

export interface BookingTransaction {
  id: string;
  bookingId: string;
  amountCash: number;
  amountPoints: number;
  transactionDate: string;
  confirmationNumber: string | null;
  notes: string | null;
  paymentMethodId?: string | null;
  paymentMethodNickname?: string | null;
  createdAt: string;
}

export interface AddBookingTransactionPayload {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string | null;
  notes?: string | null;
  paymentMethodId?: string | null;
}

export interface FirstTransactionPayload {
  transactionDate: string;
  paymentMethodId?: string | null;
}

export interface PaymentMethod {
  id: string;
  nickname: string;
  archived: boolean;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlightTravelerSeat {
  id: string;
  legId: string;
  participantId: string;
  seatNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlightLegPayload {
  id?: string;
  legOrder?: number;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  airline?: string;
  flightNumber?: string;
  checkPriceUrl?: string;
}

export interface TripDestination {
  id: string;
  tripId: string;
  name: string;
  color: string | null;
  position: number;
  packingListId: string;
  memberIds: string[];
}

/** `trip_destination` on GET /packing-lists/:id */
export interface ListTripContext {
  tripId: string;
  tripName: string;
  destinations: TripDestination[];
}

/** `trip_destination` on each list from GET /families/:familyId/packing-lists */
export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
  color?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}

export interface DestinationWritePayload {
  name?: string;
  memberIds?: string[];
  itemGroupIds?: string[];
  packingListId?: string;
  color?: string;
  position?: number;
  /** Take the chosen people (and their items) out of the trip's other destinations. */
  moveFrom?: boolean;
  /** Only used when the trip had one destination: where its whole-family items go. */
  sharedItemsTo?: 'existing' | 'new';
}

export interface CopyTripPayload {
  name: string;
  includeOneOffs: boolean;
}

export interface CopyTripResult {
  trip: Trip;
  destinations: TripDestination[];
}

export interface SplitListPayload {
  sourceListId: string;
  destinations: { name: string; memberIds: string[] }[];
  sharedItemsDestinationIndex: number;
}

export interface SplitResult {
  destinations: TripDestination[];
  skippedCount: number;
}
