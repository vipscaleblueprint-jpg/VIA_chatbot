type Session = {
    lastTopic?: string;
  };
  
  const sessions = new Map<string, Session>();
  
  function getSession(id: string): Session {
    if (!sessions.has(id)) {
      sessions.set(id, {});
    }
    return sessions.get(id)!;
  }
  
  /* GET LAST TOPIC */
  export function getTopic(id: string): string | undefined {
    return getSession(id).lastTopic;
  }
  
  /* SAVE TOPIC */
  export function setTopic(id: string, topic: string) {
    const s = getSession(id);
    s.lastTopic = topic;
  }