import type { LineConfig } from "../../types.js";
import { isConfiguredAdminLineUser } from "../../helpers/config.js";

export { isConfiguredAdminLineUser };

export async function isAuthorizedLineAdmin(
	lineUserId: string,
	config: LineConfig,
): Promise<boolean> {
	return isConfiguredAdminLineUser(lineUserId, config.ADMIN_LINE_USER_ID);
}
