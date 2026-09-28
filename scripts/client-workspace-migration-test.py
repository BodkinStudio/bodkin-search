"""Run with python3 scripts/client-workspace-migration-test.py."""
import importlib.util
from pathlib import Path
import sqlite3
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('client-workspace-migration.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
        CREATE TABLE user(id TEXT PRIMARY KEY);
        CREATE TABLE organization(id TEXT PRIMARY KEY,name TEXT,slug TEXT,created_at INTEGER);
        CREATE TABLE member(id TEXT PRIMARY KEY,organization_id TEXT,user_id TEXT,role TEXT,created_at INTEGER,UNIQUE(organization_id,user_id));
        CREATE TABLE workspace_configuration(organization_id TEXT PRIMARY KEY,payer_organization_id TEXT,status TEXT);
        CREATE TABLE workspace_audit(id TEXT PRIMARY KEY,organization_id TEXT);
        CREATE TABLE projects(id TEXT PRIMARY KEY,organization_id TEXT);
        CREATE TABLE growth_actions(id TEXT PRIMARY KEY,project_id TEXT,content TEXT);
        INSERT INTO user VALUES('explicit-owner');
        INSERT INTO organization VALUES('source','Agency','source',1);
        INSERT INTO projects VALUES('yakchat','source'),('other','source');
        INSERT INTO growth_actions VALUES('growth','yakchat','Preserve me');
        ''')
        for table in migration.DEPENDENCIES:
            self.db.execute(f'CREATE TABLE {table}(id TEXT PRIMARY KEY,project_id TEXT,organization_id TEXT,token TEXT)')
            self.db.execute(f"INSERT INTO {table} VALUES('connection','yakchat','source','private')")
        self.db.commit()
        self.args = SimpleNamespace(owner_user_id='explicit-owner', source_org_id='source', target_org_id='client', target_name='Client', project_id='yakchat', normalize_legacy_org=[], apply=False)

    def tearDown(self):
        self.db.close()

    def test_transfer_preserves_content_and_other_projects(self):
        report = migration.migrate(self.db, self.args)
        self.assertTrue(report['all_protected_hashes_match'])
        self.assertEqual(self.db.execute("SELECT organization_id FROM projects WHERE id='other'").fetchone(), ('source',))
        self.assertEqual(self.db.execute("SELECT organization_id FROM projects WHERE id='yakchat'").fetchone(), ('client',))
        self.assertEqual(self.db.execute("SELECT payer_organization_id FROM workspace_configuration WHERE organization_id='client'").fetchone(), ('source',))
        self.db.rollback()
        self.assertEqual(self.db.execute("SELECT organization_id FROM projects WHERE id='yakchat'").fetchone(), ('source',))

    def test_unknown_owner_and_role_fail(self):
        self.args.owner_user_id = 'unknown'
        with self.assertRaises(ValueError):
            migration.migrate(self.db, self.args)
        self.args.owner_user_id = 'explicit-owner'
        self.db.execute("INSERT INTO member VALUES('bad','source','explicit-owner','superuser',1)")
        with self.assertRaises(ValueError):
            migration.migrate(self.db, self.args)

    def test_legacy_roles_require_explicit_selection(self):
        self.db.execute("INSERT INTO member VALUES('legacy','source','someone','member',1)")
        self.db.commit()
        with self.assertRaises(ValueError):
            migration.migrate(self.db, self.args)
        self.db.rollback()
        self.args.normalize_legacy_org = ['source']
        migration.migrate(self.db, self.args)
        self.assertEqual(self.db.execute("SELECT role FROM member WHERE id='legacy'").fetchone(), ('editor',))

    def test_content_mismatch_rolls_back(self):
        self.db.executescript("CREATE TRIGGER corrupt AFTER UPDATE ON projects BEGIN UPDATE growth_actions SET content='oops'; END;")
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            migration.migrate(self.db, self.args)
        self.db.rollback()
        self.assertEqual(self.db.execute('SELECT content FROM growth_actions').fetchone(), ('Preserve me',))

    def test_new_dependency_fails_closed(self):
        self.db.execute('CREATE TABLE future_connections(project_id TEXT,organization_id TEXT)')
        with self.assertRaisesRegex(ValueError, 'inventory changed'):
            migration.migrate(self.db, self.args)


if __name__ == '__main__':
    unittest.main()
