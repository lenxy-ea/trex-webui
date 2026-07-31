type StatusFooterProps = {
  connected: boolean;
};

export function StatusFooter({ connected }: StatusFooterProps) {
  return (
    <footer className="status-footer">
      <span>{connected ? "Connected" : "Disconnected"}</span>
      <span className={connected ? "status-light status-light--ok" : "status-light"} />
    </footer>
  );
}
