import React, { useState } from 'react';

export default function CreateStoreDialog({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('woocommerce');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (adminUser && adminUser.length < 3) {
      setError('Admin username must be at least 3 characters');
      return;
    }

    if (adminPassword && adminPassword.length < 6) {
      setError('Admin password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(name, type, adminUser || undefined, adminPassword || undefined);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Store</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="store-name">Store Name</label>
            <input
              id="store-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Store"
              autoFocus
              disabled={loading}
            />
            <div className="form-hint">
              Any name you like — a URL-safe slug is auto-generated
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="store-type">Platform</label>
            <select
              id="store-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={loading}
            >
              <option value="woocommerce">WooCommerce</option>
              <option value="medusa" disabled>
                MedusaJS (Coming Soon)
              </option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="admin-user">Admin Username</label>
            <input
              id="admin-user"
              type="text"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="admin"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="admin-password">Admin Password</label>
            <input
              id="admin-password"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Leave empty for auto-generated"
              disabled={loading}
            />
            <div className="form-hint">
              Min 6 characters. Leave empty to auto-generate.
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
