import type { API } from "homebridge";

import { ProcmonPlatform } from "./platform";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";

export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ProcmonPlatform);
};
