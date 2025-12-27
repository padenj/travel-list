import React, { useEffect, useState } from 'react';

export default function VersionText(): React.ReactElement {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/build-info');
        if (!res.ok) return;
        const body = await res.json();
        if (mounted && body && body.build && body.build.version) setVersion(body.build.version);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);
  return <span>{version || 'dev'}</span>;
}
