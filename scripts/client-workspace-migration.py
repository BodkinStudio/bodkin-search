#!/usr/bin/env python3
"""Offline SQLite/D1-copy workspace migration. Never connects to a cloud service."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import sys
import uuid

DEPENDENCIES = {'gsc_connections', 'ga4_connections', 'youtube_connections', 'linkedin_page_connections'}
ROLES = {'owner', 'admin', 'editor', 'viewer', 'member'}
ROOT = Path(__file__).resolve().parents[1]


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def private_path(path):
    path = Path(path).resolve()
    if not path.is_relative_to(ROOT / '.bodkin'):
        raise ValueError('Database copies, backups and evidence must be under ignored .bodkin/')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def snapshot(source, destination):
    destination = private_path(destination)
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    with sqlite3.connect(f'file:{Path(source).resolve()}?mode=ro', uri=True) as src:
        with sqlite3.connect(destination) as dest:
            src.backup(dest)
    return destination


def table_columns(db):
    return {name: [r[1] for r in db.execute(f'PRAGMA table_info({quote(name)})')]
            for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def digest(rows):
    encoded = [json.dumps(list(row), sort_keys=True, default=lambda x: x.hex(), separators=(',', ':')) for row in rows]
    return hashlib.sha256('\n'.join(sorted(encoded)).encode()).hexdigest()


def protected_hashes(db, columns, project):
    result = {}
    mutable = {'organization', 'member', 'workspace_configuration', 'workspace_audit'}
    for name, fields in columns.items():
        if name in mutable:
            continue
        selection = [quote(f) for f in fields]
        # Ignore exactly the intended tenant field on selected project rows only.
        if name == 'projects' or name in DEPENDENCIES:
            key = 'id' if name == 'projects' else 'project_id'
            selection = [f'CASE WHEN {quote(key)} = ? THEN NULL ELSE organization_id END' if f == 'organization_id' else quote(f) for f in fields]
            rows = db.execute(f'SELECT {",".join(selection)} FROM {quote(name)}', (project,)).fetchall()
        else:
            rows = db.execute(f'SELECT {",".join(selection)} FROM {quote(name)}').fetchall()
        result[name] = {'rows': len(rows), 'sha256': digest(rows)}
    return result


def preflight_schema(db):
    columns = table_columns(db)
    if 'invitation' in columns:
        if any(role is not None and role not in ROLES for (role,) in db.execute('SELECT DISTINCT role FROM invitation')):
            raise ValueError('Invitation contains unsupported roles; resolve them before applying schema constraints')
        if any(status not in {'pending', 'accepted', 'revoked', 'canceled', 'rejected'} for (status,) in db.execute('SELECT DISTINCT status FROM invitation')):
            raise ValueError('Invitation contains unsupported statuses; resolve them before applying schema constraints')
    if any(role not in ROLES for (role,) in db.execute('SELECT DISTINCT role FROM member')):
        raise ValueError('Unknown membership roles require explicit repair')
    if 'workspace_configuration' in columns and db.execute("SELECT 1 FROM workspace_configuration WHERE status NOT IN ('active','suspended')").fetchone():
        raise ValueError('Unsupported workspace status; resolve before applying schema constraints')
    if db.execute('SELECT 1 FROM member GROUP BY organization_id,user_id HAVING count(*)>1').fetchone():
        raise ValueError('Duplicate memberships require explicit repair before schema migration')


def migrate(db, args):
    columns = table_columns(db)
    required = {'organization', 'member', 'projects', 'user', 'workspace_configuration', 'workspace_audit'}
    if not required <= columns.keys():
        raise ValueError('Apply reviewed workspace schema migrations to the offline copy first')
    discovered = {t for t, c in columns.items() if {'project_id', 'organization_id'} <= set(c)}
    if discovered != DEPENDENCIES:
        raise ValueError('Project/organization dependency inventory changed; review script before migration')
    if db.execute('SELECT 1 FROM member GROUP BY organization_id,user_id HAVING count(*)>1').fetchone():
        raise ValueError('Duplicate memberships require explicit repair before migration')
    preflight_schema(db)
    if not db.execute('SELECT 1 FROM user WHERE id=?', (args.owner_user_id,)).fetchone():
        raise ValueError('Explicit owner user ID does not exist; never infer identity from email')
    if not db.execute('SELECT 1 FROM organization WHERE id=?', (args.source_org_id,)).fetchone():
        raise ValueError('Source workspace does not exist')
    if db.execute('SELECT 1 FROM organization WHERE id=?', (args.target_org_id,)).fetchone():
        raise ValueError('Target workspace must be new; migration does not merge workspaces')
    if db.execute('SELECT organization_id FROM projects WHERE id=?', (args.project_id,)).fetchone() != (args.source_org_id,):
        raise ValueError('Selected project does not belong to selected source workspace')
    source_config = db.execute('SELECT payer_organization_id,status FROM workspace_configuration WHERE organization_id=?', (args.source_org_id,)).fetchone()
    if source_config and source_config[1] != 'active':
        raise ValueError('Source workspace is inactive')
    payer = source_config[0] if source_config else args.source_org_id
    for name in DEPENDENCIES:
        if db.execute(f'SELECT 1 FROM {quote(name)} WHERE project_id=? AND organization_id<>?', (args.project_id, args.source_org_id)).fetchone():
            raise ValueError('Connection tenant mismatch requires explicit repair')
    before = protected_hashes(db, columns, args.project_id)
    # Snapshot all control-plane rows too; compare exact expected post-migration rows.
    control = {t: db.execute(f'SELECT * FROM {quote(t)}').fetchall() for t in ('organization', 'member', 'workspace_configuration', 'workspace_audit')}
    now = int(time.time() * 1000)
    db.execute('INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)', (args.target_org_id, args.target_name, args.target_org_id, now))
    for org in (args.source_org_id, args.target_org_id):
        db.execute("INSERT INTO workspace_configuration(organization_id,payer_organization_id,status) VALUES(?,?,'active') ON CONFLICT(organization_id) DO NOTHING", (org, payer))
        if org in args.normalize_legacy_org:
            db.execute("UPDATE member SET role='editor' WHERE organization_id=? AND role='member'", (org,))
        elif db.execute("SELECT 1 FROM member WHERE organization_id=? AND role='member'", (org,)).fetchone():
            raise ValueError('Legacy member roles require --normalize-legacy-org for the selected workspace')
        db.execute("INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,'owner',?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role='owner'", (str(uuid.uuid4()), org, args.owner_user_id, now))
    changed = {}
    for name in ['projects', *sorted(DEPENDENCIES)]:
        key = 'id' if name == 'projects' else 'project_id'
        changed[name] = db.execute(f'UPDATE {quote(name)} SET organization_id=? WHERE {quote(key)}=? AND organization_id=?', (args.target_org_id, args.project_id, args.source_org_id)).rowcount
    after = protected_hashes(db, columns, args.project_id)
    if before != after:
        raise ValueError('Protected content hash mismatch; rolling back')
    for name, old_rows in control.items():
        fields = columns[name]
        new_by_id = {r[0]: r for r in db.execute(f'SELECT * FROM {quote(name)}')}
        old_ids = {row[0] for row in old_rows}
        for added_id in new_by_id.keys() - old_ids:
            added = dict(zip(fields, new_by_id[added_id]))
            permitted = (
                name == 'organization' and added['id'] == args.target_org_id
                or name == 'workspace_configuration'
                and added['organization_id'] in (args.source_org_id, args.target_org_id)
                and added['payer_organization_id'] == payer and added['status'] == 'active'
                or name == 'member'
                and added['organization_id'] in (args.source_org_id, args.target_org_id)
                and added['user_id'] == args.owner_user_id and added['role'] == 'owner'
            )
            if not permitted:
                raise ValueError('Unexpected control-plane insertion; rolling back')
        for old in old_rows:
            expected = list(old)
            if name == 'member' and old[fields.index('organization_id')] in (args.source_org_id, args.target_org_id):
                org = old[fields.index('organization_id')]
                if org in args.normalize_legacy_org and old[fields.index('role')] == 'member':
                    expected[fields.index('role')] = 'editor'
                if old[fields.index('user_id')] == args.owner_user_id:
                    expected[fields.index('role')] = 'owner'
            if tuple(expected) != new_by_id.get(old[0]):
                raise ValueError('Unexpected control-plane mutation; rolling back')
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise ValueError('Foreign key check failed; rolling back')
    return {'status': 'applied' if args.apply else 'dry-run-rolled-back', 'changed_rows': changed, 'protected_tables': before, 'all_protected_hashes_match': True, 'foreign_key_check': 'passed'}


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'schema-preflight':
        parser = argparse.ArgumentParser(description='Read-only role/status preflight before workspace schema migrations')
        parser.add_argument('--database', required=True)
        args = parser.parse_args(sys.argv[2:])
        with sqlite3.connect(f'file:{private_path(args.database)}?mode=ro', uri=True) as db:
            preflight_schema(db)
        print('Workspace schema preflight passed; no data changed')
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, help='Offline SQLite copy under .bodkin; never the active D1 file')
    parser.add_argument('--copy-from', help='Create database using SQLite backup API; source is opened read-only')
    for key in ('owner-user-id', 'source-org-id', 'target-org-id', 'target-name', 'project-id', 'evidence'):
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--normalize-legacy-org', action='append', default=[])
    parser.add_argument('--apply', action='store_true', help='Commit to the offline copy; default always rolls back')
    args = parser.parse_args()
    try:
        database = private_path(args.database)
        if set(args.normalize_legacy_org) - {args.source_org_id, args.target_org_id}:
            raise ValueError('Role normalization is limited to explicitly selected source and target')
        if args.copy_from:
            snapshot(args.copy_from, database)
        if not database.is_file():
            raise ValueError('Offline database copy does not exist')
        os.chmod(database, 0o600)
        if args.apply:
            snapshot(database, database.with_name(database.name + '.before-' + str(uuid.uuid4())))
        with sqlite3.connect(database) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
            try:
                report = migrate(db, args)
                if args.apply:
                    db.commit()
                else:
                    db.rollback()
            except Exception:
                db.rollback()
                raise
        evidence = private_path(args.evidence)
        fd = os.open(evidence, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump(report, out, indent=2)
        print(json.dumps({k: v for k, v in report.items() if k != 'protected_tables'}))
    except (ValueError, sqlite3.Error, OSError) as error:
        # DB exceptions can contain submitted data; print only a class for those.
        parser.exit(1, (str(error) if isinstance(error, ValueError) else type(error).__name__) + '\n')


if __name__ == '__main__':
    main()
