import { Capacitor } from '@capacitor/core';
import { createAnalytics } from './analytics/events.js';

export const analytics = createAnalytics({
  enabled: import.meta.env?.PROD === true && import.meta.env?.NC_WEB_ANALYTICS === true &&
    !Capacitor.isNativePlatform(),
});
