// PROJ2-4b — the shared folder-tree attachments surface, mounted at Site /
// Project / (future) Job entry points. Server component: hydrates the tree +
// its files for the requested lens, then hands off to the client tree.
//   lens='site'    → whole tree for a site
//   lens='project' → one project's subtree
//   lens='job'     → one Job's subtree (ready for PROJ2-4d to wire)

import {
  listFoldersForSite,
  listFoldersForProject,
  listFoldersForJob,
  listAttachmentsForFolders,
  listUnfiledFolderAttachments,
} from "@/lib/api/attachment-folders";
import { FolderTreeClient } from "@/components/modules/attachments/FolderTreeClient";

export async function FolderTreeAttachments({
  rootSiteId,
  lens,
  rootProjectId,
  rootJobId,
  canEdit,
}: {
  rootSiteId: string;
  lens: "site" | "project" | "job";
  rootProjectId?: string;
  rootJobId?: string;
  canEdit: boolean;
}) {
  const folders =
    lens === "project" && rootProjectId
      ? await listFoldersForProject(rootProjectId)
      : lens === "job" && rootJobId
        ? await listFoldersForJob(rootJobId)
        : await listFoldersForSite(rootSiteId);

  const [files, unfiled] = await Promise.all([
    listAttachmentsForFolders(folders.map((f) => f.id)),
    listUnfiledFolderAttachments(),
  ]);

  return (
    <FolderTreeClient
      folders={folders}
      files={files}
      unfiled={unfiled}
      canEdit={canEdit}
    />
  );
}
