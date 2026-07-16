import type { Route } from '../../routes/+types/listing-group';

export type ListingGroupData = Route.ComponentProps['loaderData'];
export type ListingGroupState = ListingGroupData['state'];
export type BookingMode = ListingGroupState['mode'];
export type RoomOption = ListingGroupData['roomOptions'][number];
export type RoomTrust = RoomOption['detail']['trust'];
