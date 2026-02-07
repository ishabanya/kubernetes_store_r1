import React from 'react';

const statusBadgeClass = {
  ready: 'badge badge-ready',
  provisioning: 'badge badge-provisioning',
  deleting: 'badge badge-deleting',
  failed: 'badge badge-failed',
};

export default function StoreCard({ store, onDelete }) {
  const isActive = store.status === 'provisioning' || store.status === 'deleting';

  return (
    <div className="store-card">
      <div className="store-card-header">
        <h3>{store.name}</h3>
        <span className={statusBadgeClass[store.status] || 'badge'}>
          {isActive && <span className="spinner" />}
          {store.status}
        </span>
      </div>

      <div className="store-card-type">
        {store.type === 'woocommerce' ? 'WooCommerce' : 'MedusaJS'}
      </div>

      {store.store_url && (
        <div className="store-card-urls">
          <a href={store.store_url} target="_blank" rel="noopener noreferrer">
            Store: {store.store_url}
          </a>
          <a href={store.admin_url} target="_blank" rel="noopener noreferrer">
            Admin: {store.admin_url}
          </a>
        </div>
      )}

      {store.error_message && (
        <div className="store-card-error">{store.error_message}</div>
      )}

      <div className="store-card-footer">
        <span className="store-card-time">
          {new Date(store.created_at + 'Z').toLocaleString()}
        </span>
        <button
          className="btn btn-danger"
          onClick={() => onDelete(store)}
          disabled={store.status === 'deleting'}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
