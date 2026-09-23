export type Ticket = { id: number; controller: AbortController };

// Shared lifecycle for analysis and generation; a replaced image starts a new era.
export class RequestGate {
  private revision = 0;
  private active: Ticket | null = null;

  begin(): Ticket | null {
    if (this.active) return null;
    this.active = { id: ++this.revision, controller: new AbortController() };
    return this.active;
  }
  isCurrent(ticket: Ticket): boolean {
    return this.active === ticket && ticket.id === this.revision;
  }
  finish(ticket: Ticket): boolean {
    if (!this.isCurrent(ticket)) return false;
    this.active = null;
    return true;
  }
  invalidate(): void {
    this.revision++;
    this.active?.controller.abort();
    this.active = null;
  }
}
