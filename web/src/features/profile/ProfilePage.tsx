import { LogOut } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Badge, Button, Card, Spinner } from '../../components/ui';

export function ProfilePage() {
  useDocumentTitle('Profile');
  const { profile, isAdmin, signOut } = useAuth();
  return (
    <div className="page">
      <header className="page-head"><h1>Profile</h1></header>
      {!profile ? <Spinner /> : (
        <Card>
          <dl className="summary-list">
            <div><dt>Name</dt><dd>{profile.full_name}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
            <div><dt>Account status</dt><dd><Badge tone={profile.is_active ? 'success' : 'danger'}>{profile.is_active ? 'Active' : 'Disabled'}</Badge></dd></div>
            {isAdmin && <div><dt>Role</dt><dd><Badge tone="info">Administrator</Badge></dd></div>}
          </dl>
        </Card>
      )}
      <Button variant="secondary" size="lg" block onClick={() => void signOut()}>
        <LogOut size={20} aria-hidden /> Sign out
      </Button>
    </div>
  );
}
