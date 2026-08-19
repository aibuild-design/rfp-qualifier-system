-- Where to post a verdict in Slack.
--
-- Khaled asked for Slack rather than only email, which the SOW named as one of
-- the two delivery routes for module 2 all along.
--
-- An incoming-webhook URL rather than a Slack app credential, deliberately.
-- A credential means an OAuth flow, a workspace install and a token that has to
-- live somewhere; a webhook URL is one string that Slack hands you from the
-- channel you want posts to land in, and it can be revoked from that same page
-- without touching anything here.
--
-- Null means no Slack. Nothing is retried, nothing errors, and the email still
-- goes: a chat integration that has not been set up must never be the reason a
-- verdict fails to reach anybody.
alter table scoring_settings add column if not exists slack_webhook_url text;

comment on column scoring_settings.slack_webhook_url is
  'Slack incoming-webhook URL for verdict notifications. Null disables Slack entirely; the email notification is unaffected either way.';
