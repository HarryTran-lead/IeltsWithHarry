export type RightsEvidence = {
  asset_kind: "text" | "audio" | "image";
  asset_url: string | null;
  author_name: string;
  rights_holder: string;
  permission_document_ref: string;
  permission_scope: string;
  web_publication_allowed: boolean;
  commercial_use_allowed: boolean;
  modification_translation_allowed: boolean;
  source_package_name: string | null;
  source_package_sha256: string | null;
};

export function assertPublishRightsEvidence(rows: RightsEvidence[], assets: { kind: "audio" | "image"; url: string | null }[] = []) {
  const valid = (row: RightsEvidence) => row.author_name.trim().length >= 2
    && row.rights_holder.trim().length >= 2
    && row.permission_document_ref.trim().length >= 12
    && row.permission_scope.trim().length >= 20
    && row.web_publication_allowed && row.commercial_use_allowed && row.modification_translation_allowed
    && (Boolean(row.source_package_name) === Boolean(row.source_package_sha256));
  if (!rows.some((row) => row.asset_kind === "text" && valid(row))) {
    throw new Error("Reviewed text rights evidence is required before publication");
  }
  for (const asset of assets) {
    if (!rows.some((row) => row.asset_kind === asset.kind && (asset.url === null || row.asset_url === asset.url) && valid(row))) {
      throw new Error(`Reviewed ${asset.kind} rights evidence is required before publication${asset.url ? `: ${asset.url}` : ""}`);
    }
  }
}
