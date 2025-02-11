import type { RequestHandler } from '@sveltejs/kit'
import { query } from '../_db'

export const post: RequestHandler = async event => {
  const { slug } = event.params

  let result
  let sql

  try {
    switch (slug) {
      case 'login': 
        sql = `SELECT authenticate($1) AS "authenticationResult";`
        break
      case 'register':
        sql = `SELECT register($1) AS "authenticationResult";`
        break
      case 'logout':
        if (event.locals.user) { // if user is null, they are logged out anyway (session might have ended)
          sql = `CALL delete_session($1);`
          result = await query(sql, [event.locals.user.id])
        }
        return {
          status: 200,
          headers: {
            'Set-Cookie': `session=; Path=/; SameSite=Lax; HttpOnly; Expires=${new Date().toUTCString()}`
          },
          body: {
            message: 'Logout successful.'
          }
        }
      default:
        return {
          status: 404,
          body: {
            message: 'Invalid endpoint.',
            user: null
          }
        }
    }

    // Only /auth/login and /auth/register at this point
    const body = event.request.json()
    result = await query(sql, [JSON.stringify(body)])

  } catch (error) {
    return {
      status: 503,
      body: {
        message: 'Could not communicate with database.',
        user: null
      }
    }
  }

  const { authenticationResult }: { authenticationResult: AuthenticationResult } = result.rows[0]

  if (!authenticationResult.user) {
    return {
      status: authenticationResult.statusCode,
      body: {
        message: authenticationResult.status,
        user: null,
        sessionId: null
      }
    }
  }

  // Prevent hooks.ts:handle() from deleting cookie we just set
  event.locals.user = authenticationResult.user

  return {
    status: authenticationResult.statusCode,
    headers: { // database expires sessions in 2 hours (could do it here too)
      'Set-Cookie': `session=${authenticationResult.sessionId}; Path=/; SameSite=Lax; HttpOnly;`
    },
    body: {
      message: authenticationResult.status,
      user: authenticationResult.user,
    }
  }
}