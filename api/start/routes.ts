/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    router
      .group(() => {
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
        router.patch('password', [controllers.AccountPasswords, 'update'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth({ guards: ['web'] }))

    router
      .group(() => {
        router.get('users', [controllers.Users, 'index'])
        router.post('users', [controllers.Users, 'store'])
        router.get('users/:id', [controllers.Users, 'show'])
        router.patch('users/:id', [controllers.Users, 'update'])
        router.patch('users/:id/status', [controllers.Users, 'updateStatus'])
        router.get('users/:userId/courses', [controllers.StudentCourseAssociations, 'index'])
        router.put('users/:userId/courses/:courseId', [
          controllers.StudentCourseAssociations,
          'upsert',
        ])
        router.delete('users/:userId/courses/:courseId', [
          controllers.StudentCourseAssociations,
          'destroy',
        ])
      })
      .use(middleware.auth({ guards: ['web'] }))
      .use(middleware.admin())

    router
      .group(() => {
        router.get('courses', [controllers.Courses, 'index'])
        router.post('courses', [controllers.Courses, 'store'])
        router.get('courses/:id', [controllers.Courses, 'show'])
        router.patch('courses/:id', [controllers.Courses, 'update'])
        router.post('courses/:courseId/modules', [controllers.Courses, 'storeModule'])
        router.patch('courses/:courseId/modules/:id', [controllers.Courses, 'updateModule'])
        router.delete('courses/:courseId/modules/:id', [controllers.Courses, 'destroyModule'])
        router.put('courses/:courseId/modules/order', [controllers.Courses, 'reorderModules'])
      })
      .use(middleware.auth({ guards: ['web'] }))
      .use(middleware.admin())

    router
      .group(() => {
        router.get('upload-settings', [controllers.UploadSettings, 'index'])
        router.patch('upload-settings/:type', [controllers.UploadSettings, 'update'])
        router.get('modules/:moduleId/materials', [controllers.Materials, 'index'])
        router
          .post('modules/:moduleId/materials', [controllers.Materials, 'store'])
          .use(middleware.materialMultipart())
        router.patch('modules/:moduleId/materials/:id', [controllers.Materials, 'update'])
        router.delete('modules/:moduleId/materials/:id', [controllers.Materials, 'destroy'])
      })
      .use(middleware.auth({ guards: ['web'] }))
      .use(middleware.admin())

    router
      .group(() => {
        router.get('access-rules', [controllers.AccessRules, 'index'])
        router.put('access-rules', [controllers.AccessRules, 'upsert'])
        router.delete('access-rules/:id', [controllers.AccessRules, 'destroy'])
        router.get('access-rules/effective', [controllers.AccessRules, 'effective'])
      })
      .use(middleware.auth({ guards: ['web'] }))
      .use(middleware.admin())

    router
      .group(() => {
        router.get('materials/:id/view', [controllers.ProtectedMaterials, 'view'])
        router.get('materials/:materialId/derivatives/:derivativeId', [
          controllers.ProtectedMaterials,
          'derivative',
        ])
        router.get('materials/:materialId/tiles/manifest', [
          controllers.ProtectedMaterials,
          'tileManifest',
        ])
        router.get('materials/:materialId/tiles/:level/:column/:row', [
          controllers.ProtectedMaterials,
          'tile',
        ])
        router.post('materials/:id/download-url', [controllers.ProtectedMaterials, 'downloadUrl'])
      })
      .use(middleware.auth({ guards: ['web'] }))

    router
      .group(() => {
        router.get('courses', [controllers.StudentCatalog, 'index'])
        router.get('courses/:id', [controllers.StudentCatalog, 'show'])
      })
      .prefix('student')
      .use(middleware.auth({ guards: ['web'] }))
  })
  .prefix('/api/v1')
