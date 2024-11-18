import pytest
import sqlalchemy as sa
from tests.utils.npm import NPMCommandRunner
from bitsnark.core.models import TransactionTemplate


pytestmark = pytest.mark.usefixtures('docker_compose')


def test_scripts(dbsession, npm: NPMCommandRunner):
    npm.run('emulate-setup')

    with dbsession.begin():
        templates = dbsession.execute(
            sa.select(TransactionTemplate)
        ).all()
        print("Num templates:", len(templates))
    assert 1 == 1