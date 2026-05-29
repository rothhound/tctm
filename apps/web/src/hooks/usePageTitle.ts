import { useEffect } from 'react';

export function usePageTitle(section: string) {
  useEffect(() => {
    document.title = `TCTM | ${section}`;
    return () => { document.title = 'TCTM'; };
  }, [section]);
}
