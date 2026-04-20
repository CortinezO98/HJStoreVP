import sys
sys.path.insert(0, '/app')
from app.core.security import verify_password, hash_password
from app.db.session import SessionLocal
from app.models.models import User

db = SessionLocal()
user = db.query(User).filter(User.email == 'admin@hjstorevp.com').first()
print('Usuario encontrado:', user is not None)
if user:
    print('Email:', user.email)
    print('Active:', user.active)
    print('Role:', user.role)
    print('Hash en BD:', user.hashed_password[:40])
    resultado = verify_password('Admin123!', user.hashed_password)
    print('verify_password Admin123!:', resultado)
    nuevo_hash = hash_password('Admin123!')
    print('Nuevo hash generado:', nuevo_hash[:40])
    resultado2 = verify_password('Admin123!', nuevo_hash)
    print('verify con hash nuevo:', resultado2)
    if not resultado:
        print('Actualizando hash en BD...')
        user.hashed_password = nuevo_hash
        db.commit()
        print('Hash actualizado OK - intenta login ahora')
else:
    print('ERROR: usuario no encontrado')
db.close()