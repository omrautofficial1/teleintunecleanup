import { graphRequest, type GraphRequestOptions } from './graphClient';

const AUDIT_EVENTS_URL =
    'https://graph.microsoft.com/v1.0/deviceManagement/auditEvents?$top=100&$orderby=activityDateTime%20desc';

export interface IntuneAuditEvent {
    id: string;
    activityDateTime: string;
    activityType: string;
    activity: string;
    displayName: string;
    actor?: { userId?: string; userPrincipalName?: string };
    resources?: Array<{ resourceId?: string; resourceName?: string; scope?: string }>;
}

export async function listIntuneAuditEvents(
    options: GraphRequestOptions,
): Promise<IntuneAuditEvent[]> {
    const response = await graphRequest(AUDIT_EVENTS_URL, options);
    const body = (await response.json()) as { value?: IntuneAuditEvent[] };
    return body.value ?? [];
}
