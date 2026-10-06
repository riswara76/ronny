import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFacilitiesOverview } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { FacilityOverview } from '../../lib/types';
import { FACILITY_DESCRIPTION } from '../../lib/labels';
import { FacilityIcon } from '../../components/FacilityIcon';
import { ErrorState, Spinner } from '../../components/ui';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';

export function FacilityGrid({ facilities, showAvailability }: { facilities: FacilityOverview[]; showAvailability?: boolean }) {
  return (
    <ul className="facility-grid">
      {facilities.map((f) => (
        <li key={f.facility_id}>
          <Link to={`/book/${f.code.toLowerCase()}`} className="facility-card" data-testid={`facility-${f.code}`}>
            <span className="facility-icon-badge" aria-hidden><FacilityIcon code={f.code} size={30} /></span>
            <span className="facility-text">
              <strong>{f.name}</strong>
              <small>{FACILITY_DESCRIPTION[f.code] ?? ''}</small>
              {showAvailability && (
                <small className={f.available_slots > 0 ? 'avail-yes' : 'avail-no'}>
                  {f.available_slots > 0
                    ? `${f.available_slots} time${f.available_slots === 1 ? '' : 's'} left today`
                    : f.blocked_slots > 0 ? 'Unavailable today' : 'Fully booked today'}
                </small>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FacilityListPage() {
  useDocumentTitle('Book');
  const { config } = useAuth();
  const online = useOnline();
  const today = config!.today;
  const overview = useQuery({ queryKey: ['overview', today], queryFn: () => getFacilitiesOverview(today), enabled: online, staleTime: 0 });
  return (
    <div className="page">
      <header className="page-head">
        <h1>Book a facility</h1>
        <p className="muted">Step 1 of 3 · Choose a facility</p>
      </header>
      {!online ? null : overview.isPending ? <Spinner /> : overview.error ? (
        <ErrorState message={(overview.error as AppError).message} onRetry={() => void overview.refetch()} />
      ) : (
        <FacilityGrid facilities={overview.data ?? []} showAvailability />
      )}
    </div>
  );
}
