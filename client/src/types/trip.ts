export interface Trip {
  id: string;
  familyId: string;
  name: string;
  description?: string;
  tripType?: string;
  startDate: string;
  endDate: string;
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

export interface HotelDetails {
  elementId: string;
  address?: string;
  checkInDate: string;
  checkOutDate: string;
  roomType?: string;
  bookingSource?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  advertisedLoyaltyProgram?: string;
  createdAt: string;
  updatedAt: string;
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

export interface Booking {
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
}

export interface CreateBookingPayload {
  confirmationNumber?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  loyaltyProgram?: string;
  notes?: string;
  elementIds: string[];
  travelerIds: string[];
}

export interface BookingTransaction {
  id: string;
  bookingId: string;
  amountCash: number;
  amountPoints: number;
  transactionDate: string;
  confirmationNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AddBookingTransactionPayload {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string;
  notes?: string;
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
