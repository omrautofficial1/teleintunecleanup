import { createColumnHelper } from '@tanstack/react-table';
import type { RawGraphDevice } from '../../api/types';
import { deviceTableFeatures } from './tableFeatures';

const columnHelper = createColumnHelper<typeof deviceTableFeatures, RawGraphDevice>();

export const deviceColumns = columnHelper.columns([
  columnHelper.accessor('deviceName', { header: 'Device name', sortFn: 'alphanumeric' }),
  columnHelper.accessor('serialNumber', { header: 'Serial number', cell: (info) => info.getValue() || '—' }),
  columnHelper.accessor('imei', { header: 'IMEI', cell: (info) => info.getValue() || '—' }),
  columnHelper.accessor('meid', { header: 'MEID', cell: (info) => info.getValue() || '—' }),
  columnHelper.accessor('operatingSystem', { header: 'OS' }),
  columnHelper.accessor('osVersion', { header: 'OS version' }),
  columnHelper.accessor('managementState', { header: 'Management state' }),
  columnHelper.accessor('complianceState', { header: 'Compliance' }),
  columnHelper.accessor('managedDeviceOwnerType', { header: 'Owner type' }),
  columnHelper.accessor('manufacturer', { header: 'Manufacturer' }),
  columnHelper.accessor('model', { header: 'Model' }),
  columnHelper.accessor('lastSyncDateTime', { header: 'Last sync', sortFn: 'datetime' }),
  columnHelper.accessor('enrolledDateTime', { header: 'Enrolled', sortFn: 'datetime' }),
  columnHelper.accessor('userPrincipalName', { header: 'User', cell: (info) => info.getValue() || '—' }),
]);
