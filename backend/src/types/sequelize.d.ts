// Sequelize sets `finished` on a transaction ('commit' or 'rollback') once it has ended,
// but does not declare it. The route handlers read it to skip a second rollback.
import 'sequelize';

declare module 'sequelize' {
  interface Transaction {
    finished?: 'commit' | 'rollback';
  }
}
