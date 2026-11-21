import { For, type Component } from "solid-js";
import { EnvironmentDialog } from "../../components/dialogs/EnvironmentDialog";
import { FormsDialog } from "../../components/dialogs/FormsDialog";
import { InboxDialog } from "../../components/dialogs/InboxDialog";
import { JobsDialog } from "../../components/dialogs/JobsDialog";
import { LogDialog } from "../../components/dialogs/LogDialog";
import { MediaDialog } from "../../components/dialogs/MediaDialog";
import { PairingDialog } from "../../components/dialogs/PairingDialog";
import { PromptOnceDialog } from "../../components/dialogs/PromptOnceDialog";
import { ReferenceDialog } from "../../components/dialogs/ReferenceDialog";
import { RunCommandDialog } from "../../components/dialogs/RunCommandDialog";
import { SchedulesDialog } from "../../components/dialogs/SchedulesDialog";
import { ShareDialog } from "../../components/dialogs/ShareDialog";
import { SkillsDialog } from "../../components/dialogs/SkillsDialog";
import { SyntheticDialog } from "../../components/dialogs/SyntheticDialog";
import { UsageDialog } from "../../components/dialogs/UsageDialog";
import { WaitSessionDialog } from "../../components/dialogs/WaitSessionDialog";
import { dismissDialog, useDialogEntry } from "../../store/dialogs";

type SessionDialogID =
  | "share"
  | "pairing"
  | "media"
  | "usage"
  | "references"
  | "log"
  | "inbox"
  | "forms"
  | "jobs"
  | "skills"
  | "synthetic"
  | "run-command"
  | "wait"
  | "prompt-once"
  | "schedules"
  | "environment";

interface SessionDialogComponentProps {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  skillID?: string;
  create?: boolean;
  onOpenChange: (open: boolean) => void;
}

const SessionSlot = (props: {
  id: SessionDialogID;
  component: Component<SessionDialogComponentProps>;
}) => {
  const Dialog = props.component;
  const entry = useDialogEntry(props.id);
  return (
    <Dialog
      open={entry() !== undefined}
      workspace={entry()?.props.workspace}
      sessionID={entry()?.props.sessionID}
      title={entry()?.props.title}
      skillID={entry()?.props.skillID}
      create={entry()?.props.createSkill}
      onOpenChange={dismissDialog(props.id)}
    />
  );
};

const SESSION_DIALOGS: Array<[SessionDialogID, Component<SessionDialogComponentProps>]> = [
  ["share", ShareDialog],
  ["pairing", PairingDialog],
  ["media", MediaDialog],
  ["usage", UsageDialog],
  ["references", ReferenceDialog],
  ["log", LogDialog],
  ["inbox", InboxDialog],
  ["forms", FormsDialog],
  ["jobs", JobsDialog],
  ["skills", SkillsDialog],
  ["synthetic", SyntheticDialog],
  ["run-command", RunCommandDialog],
  ["wait", WaitSessionDialog],
  ["prompt-once", PromptOnceDialog],
  ["schedules", SchedulesDialog],
  ["environment", EnvironmentDialog],
];

/** Every dialog that only needs the workspace/session/title triple. */
export function SessionDialogs() {
  return (
    <>
      <For each={SESSION_DIALOGS}>
        {(item) => <SessionSlot id={item[0]} component={item[1]} />}
      </For>
    </>
  );
}
