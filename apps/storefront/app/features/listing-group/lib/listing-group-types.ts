import type { loadListingGroupRoute } from '~/features/listing-group/server/listing-group-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export type ListingGroupData = ServerDataFrom<typeof loadListingGroupRoute>;
export type ListingGroupState = ListingGroupData['state'];
export type BookingMode = ListingGroupState['mode'];
export type RoomOption = ListingGroupData['roomOptions'][number];
export type RoomTrust = RoomOption['detail']['trust'];
