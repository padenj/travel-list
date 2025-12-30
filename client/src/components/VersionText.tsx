import React, { useEffect, useState } from 'react';
import { getBuildInfo } from '../api';

export default function VersionText(): React.ReactElement {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getBuildInfo();
        if (res.response && res.response.ok && res.data && res.data.build && res.data.build.version) {
          if (mounted) setVersion(res.data.build.version);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);
  return <span>{version || 'dev'}</span>;
}
