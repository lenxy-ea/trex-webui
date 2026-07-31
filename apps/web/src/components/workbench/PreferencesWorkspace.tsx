import type { EnvironmentReadiness } from "../../api";

type PreferencesWorkspaceProps = {
  environment: EnvironmentReadiness | null;
  onClose: () => void;
};

function slashJoin(left: string, right: string) {
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}

function commandText(command: string[] | undefined) {
  return command && command.length > 0 ? command.join(" ") : "";
}

function locationField(
  label: string,
  value: string,
  buttonLabel: string
) {
  return (
    <div className="preferences-field">
      <label>
        <span>{label}</span>
        <input aria-label={label} readOnly value={value} />
      </label>
      <button aria-label={buttonLabel} disabled type="button">...</button>
    </div>
  );
}

export function PreferencesWorkspace({ environment, onClose }: PreferencesWorkspaceProps) {
  const profileRoots = environment?.profile_roots ?? [];
  const loadLocation = profileRoots[0] ?? "";
  const saveLocation = profileRoots.length > 0 ? profileRoots[profileRoots.length - 1] : "";
  const templatesLocation = environment?.scripts_dir ? slashJoin(environment.scripts_dir, "stl") : "";
  const wiresharkLocation = commandText(environment?.capture_open_command);

  return (
    <section className="preferences-dialog" aria-label="Preferences">
      <div className="preferences-wrapper">
        {locationField("Load files from", loadLocation, "Select load files location")}
        {locationField("Save files to", saveLocation, "Select save files location")}
        {locationField("Templates dir", templatesLocation, "Select templates directory")}
        {locationField("Wireshark executable", wiresharkLocation, "Select Wireshark executable")}
      </div>
      <button className="normal-button preferences-ok-button" onClick={onClose} type="button">OK</button>
    </section>
  );
}
