import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/shells';
import { useDocumentTitle } from '../app/hooks';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <AuthLayout>
      <h1>Page not found</h1>
      <p className="muted">This page doesn't exist.</p>
      <Link className="btn btn-primary btn-lg btn-block" to="/">Go to DCU Active</Link>
    </AuthLayout>
  );
}
