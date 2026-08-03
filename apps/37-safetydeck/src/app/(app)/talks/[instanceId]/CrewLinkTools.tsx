"use client";

import { useActionState } from "react";
import { resendLinkAction, setTopicAction } from "../actions";
import { IDLE, type ActionState } from "@/lib/action-state";
import { IconLink } from "@/components/icons";

/**
 * The two things ops does to a scheduled talk: resend the link (which revokes the
 * old one) and change the topic. Both say plainly what they did, because a
 * foreman is standing in a yard waiting for a text.
 */
export function CrewLinkTools({
  instanceId,
  library,
  currentTalkId,
  completed,
}: {
  instanceId: string;
  library: { id: string; title: string }[];
  currentTalkId: string;
  completed: boolean;
}) {
  const [resendState, resendAction, resending] = useActionState<ActionState, FormData>(
    resendLinkAction,
    IDLE,
  );
  const [topicState, topicAction, changing] = useActionState<ActionState, FormData>(
    setTopicAction,
    IDLE,
  );

  return (
    <div className="mt-6 flex flex-col gap-5">
      <form action={resendAction}>
        <input type="hidden" name="instanceId" value={instanceId} />
        <button className="btn btn-secondary btn-full" type="submit" disabled={resending}>
          <IconLink size={18} />
          {resending ? "Sending…" : "Resend the crew link"}
        </button>
        <p className="t-secondary mt-2">
          Resending mints a new link and the old one stops working — that is how you cut off
          a link that went to the wrong number.
        </p>
        <Result state={resendState} />
      </form>

      {completed ? null : (
        <form action={topicAction} className="rule-t pt-5">
          <label className="t-label" htmlFor="talkId">
            Change this week&apos;s topic
          </label>
          <input type="hidden" name="instanceId" value={instanceId} />
          <select id="talkId" name="talkId" className="input mt-2" defaultValue={currentTalkId}>
            {library.map((talk) => (
              <option key={talk.id} value={talk.id}>
                {talk.title}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-full mt-3" type="submit" disabled={changing}>
            {changing ? "Changing…" : "Change topic"}
          </button>
          <Result state={topicState} />
        </form>
      )}
    </div>
  );
}

function Result({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-red)" }}>
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="t-secondary mt-2" role="status" style={{ color: "var(--color-green)" }}>
        {state.message}
      </p>
    );
  }
  return null;
}
