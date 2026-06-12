// Internal event-bus contract for "a trip was recorded". Emitted by
// OperationsService on trip creation; Billing/Payroll will subscribe later
// without coupling to this module. Money is carried as fixed 2-dp strings (the
// project-wide wire format) so subscribers never deal with float drift.
export const TRIP_CREATED_EVENT = 'trip.created';

export interface TripCreatedEvent {
  tripId: string;
  dailyLogId: string;
  truckId: string;
  clientId: string;
  // The log's calendar date (the trip's effective business date).
  date: Date;
  seq: number;
  routeLabel: string | null;
  driverWorkerId: string;
  helperWorkerId: string | null;
  billAmount: string;
  driverPay: string;
  helperPay: string;
  rateId: string | null;
  createdById: string | null;
  createdAt: Date;
}
