import { icons } from './icons.js';
import { bindSignOut } from './session.js';

const COLLAPSE_KEY = 'p360-sidebar-collapsed';

/**
 * @typedef {'dashboard' | 'admins' | 'employees' | 'library' | 'resources' | 'invoices' | 'access' | 'activity' | 'settings' | 'profile' | 'my-resources' | 'my-invoices'} NavId
 * @typedef {{ id: NavId, label: string, href: string, icon: keyof typeof icons }} NavItem
 * @typedef {{ label: string, items: NavItem[] }} NavGroup
 */

/** @param {'admin' | 'employee'} role @returns {{ home: string, groups: NavGroup[], showLogout: boolean }} */
function navFor(role) {
  if (role === 'admin') {
    return {
      home: '/admin',
      showLogout: false,
      groups: [
        { label: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
        {
          label: 'Management',
          items: [
            { id: 'admins', label: 'Admins', href: '/admin/admins', icon: 'admin' },
            { id: 'employees', label: 'Employees', href: '/admin/employees', icon: 'users' },
            { id: 'library', label: 'Internal Library', href: '/admin/library', icon: 'library' },
            { id: 'resources', label: 'Team Resources', href: '/admin/resources', icon: 'folder' },
            { id: 'invoices', label: 'Employee Invoices', href: '/admin/invoices', icon: 'invoice' }
          ]
        },
        {
          label: 'Administration',
          items: [
            { id: 'access', label: 'Access Control', href: '/admin/access', icon: 'shield' },
            { id: 'activity', label: 'Activity Logs', href: '/admin/activity', icon: 'activity' },
            { id: 'settings', label: 'Settings', href: '/admin/settings', icon: 'settings' }
          ]
        }
      ]
    };
  }
  return {
    home: '/employee',
    showLogout: true,
    groups: [
      {
        label: 'Workspace',
        items: [
          { id: 'dashboard', label: 'Dashboard', href: '/employee', icon: 'dashboard' },
          { id: 'my-resources', label: 'My Resources', href: '/employee/resources', icon: 'folder' },
          { id: 'my-invoices', label: 'My Invoices', href: '/employee/invoices', icon: 'invoice' }
        ]
      },
      {
        label: 'Account',
        items: [
          { id: 'profile', label: 'My Profile', href: '/employee/profile', icon: 'user' },
          { id: 'settings', label: 'Settings', href: '/employee/settings', icon: 'settings' }
        ]
      }
    ]
  };
}

/** @param {NavItem[]} items @param {NavId} active */
function navList(items, active) {
  return items
    .map((item) => {
      const isActive = item.id === active;
      return `<a class="nav-link${isActive ? ' is-active' : ''}" href="${item.href}" ${isActive ? 'aria-current="page"' : ''}>
        <span class="nav-link__icon">${icons[item.icon]()}</span>
        <span class="nav-link__label">${item.label}</span>
      </a>`;
    })
    .join('');
}

/**
 * @param {{ role: 'admin' | 'employee', active: NavId, title: string,
 *   user: { email: string, firstName?: string | null, displayName?: string | null, hasAvatar?: boolean, avatarUrl?: string | null } }} opts
 */
export function mountShell({ role, active, title, user }) {
  const shell = document.querySelector('[data-shell]');
  const sidebar = document.querySelector('[data-sidebar]');
  const topbar = document.querySelector('[data-topbar]');
  if (!shell || !sidebar || !topbar) throw new Error('Shell markers missing from the page.');

  const nav = navFor(role);
  const displayName = user.displayName || user.firstName || user.email.split('@')[0];
  const initial = (displayName[0] || 'P').toUpperCase();
  const avatarHtml = user.hasAvatar && user.avatarUrl
    ? `<img class="profile-menu__photo" src="${user.avatarUrl}" alt="">`
    : initial;

  const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  if (collapsed) shell.classList.add('is-collapsed');

  sidebar.innerHTML = `
    <div class="sidebar__brand">
      <a class="brand brand--shell" href="${nav.home}">
        <img class="brand__mark" src="/src/assets/img/logo.png" alt="" width="40" height="40">
        <span class="brand__text">PEARLS 360</span>
      </a>
      <button class="sidebar__collapse" type="button" data-collapse title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-expanded="${collapsed ? 'false' : 'true'}">${icons.panel()}</button>
    </div>
    <nav class="sidebar__nav" aria-label="Primary">
      ${nav.groups.map((group) => `<p class="sidebar__section">${group.label}</p>${navList(group.items, active)}`).join('')}
      ${nav.showLogout ? `<button class="nav-link nav-link--logout" type="button" data-sign-out><span class="nav-link__icon">${icons.logout()}</span><span class="nav-link__label">Logout</span></button>` : ''}
    </nav>`;

  topbar.innerHTML = `
    <div class="topbar__start">
      <button class="topbar__menu" type="button" data-open-nav aria-label="Open navigation">${icons.menu()}</button>
    </div>
    <div class="topbar__end">
      <div class="profile-menu" data-profile-menu>
        <button class="profile-menu__trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${displayName}" data-profile-toggle>
          <span class="profile-menu__avatar" aria-hidden="true">${avatarHtml}</span>
        </button>
        <div class="profile-menu__panel" role="menu" hidden data-profile-panel>
          <div class="profile-menu__identity">
            <span class="profile-menu__name">${displayName}</span>
            <span class="profile-menu__email">${user.email}</span>
          </div>
          <a class="profile-menu__item" role="menuitem" href="${role === 'admin' ? '/admin/profile' : '/employee/profile'}">My Profile</a>
          <a class="profile-menu__item" role="menuitem" href="${role === 'admin' ? '/admin/settings' : '/employee/settings'}">Settings</a>
          <a class="profile-menu__item" role="menuitem" href="/change-password">Change Password</a>
          <button class="profile-menu__item profile-menu__item--danger" role="menuitem" type="button" data-sign-out>Logout</button>
        </div>
      </div>
    </div>`;

  document.title = `${title} | Pearls360 Employee Portal`;

  const backdrop = document.querySelector('[data-sidebar-backdrop]');
  const closeMobile = () => {
    shell.classList.remove('is-nav-open');
    if (backdrop) /** @type {HTMLElement} */ (backdrop).hidden = true;
  };
  const openMobile = () => {
    shell.classList.add('is-nav-open');
    if (backdrop) /** @type {HTMLElement} */ (backdrop).hidden = false;
  };

  document.querySelector('[data-open-nav]')?.addEventListener('click', openMobile);
  backdrop?.addEventListener('click', closeMobile);
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMobile));

  const collapseBtn = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-collapse]'));
  collapseBtn?.addEventListener('click', () => {
    const next = !shell.classList.contains('is-collapsed');
    shell.classList.toggle('is-collapsed', next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    collapseBtn.title = next ? 'Expand sidebar' : 'Collapse sidebar';
    collapseBtn.setAttribute('aria-label', next ? 'Expand sidebar' : 'Collapse sidebar');
    collapseBtn.setAttribute('aria-expanded', next ? 'false' : 'true');
  });

  const toggle = document.querySelector('[data-profile-toggle]');
  const panel = document.querySelector('[data-profile-panel]');
  toggle?.addEventListener('click', () => {
    const open = panel?.hasAttribute('hidden') ?? true;
    if (open) {
      panel?.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      panel?.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', (event) => {
    const menu = document.querySelector('[data-profile-menu]');
    if (!menu || menu.contains(/** @type {Node} */ (event.target))) return;
    panel?.setAttribute('hidden', '');
    toggle?.setAttribute('aria-expanded', 'false');
  });

  bindSignOut();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMobile();
    panel?.setAttribute('hidden', '');
    toggle?.setAttribute('aria-expanded', 'false');
  });

  return { closeMobile };
}
