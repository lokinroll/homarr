"use client";

import { IconSelector, IconSettings } from "@tabler/icons-react";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import { appPermissions, appPermissionsMap } from "@homarr/definitions";
import { useI18n } from "@homarr/translation/client";

import { AccessSettings } from "~/components/access/access-settings";

interface Props {
  app: RouterOutputs["app"]["byId"];
  initialPermissions: RouterOutputs["app"]["getAppPermissions"];
}

export const AppAccessSettings = ({ app, initialPermissions }: Props) => {
  const t = useI18n();
  const utils = clientApi.useUtils();
  const { data } = clientApi.app.getAppPermissions.useQuery(
    {
      id: app.id,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      initialData: initialPermissions,
    },
  );
  const usersMutation = clientApi.app.saveUserAppPermissions.useMutation();
  const groupsMutation = clientApi.app.saveGroupAppPermissions.useMutation();

  return (
    <AccessSettings
      entity={{
        id: app.id,
        ownerId: null,
        owner: null,
      }}
      permission={{
        items: appPermissions,
        default: "use",
        fullAccessGroupPermission: "app-full-all",
        icons: {
          use: IconSelector,
          full: IconSettings,
        },
        groupPermissionMapping: appPermissionsMap,
      }}
      translate={(key) => t(`app.permission.${key}`)}
      query={{
        data,
        invalidate: () => utils.app.getAppPermissions.invalidate(),
      }}
      groupsMutation={groupsMutation}
      usersMutation={usersMutation}
    />
  );
};
