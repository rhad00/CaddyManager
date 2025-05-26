import {
  Table,
  Column,
  Model,
  DataType,
  BeforeCreate,
  BeforeUpdate,
  IsEmail,
  CreatedAt,
  UpdatedAt,
  Unique,
  DefaultScope,
} from 'sequelize-typescript';
import * as argon2 from 'argon2';

@DefaultScope(() => ({
  attributes: { exclude: ['password'] },
}))
@Table({
  tableName: 'users',
  timestamps: true,
})
export class User extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @IsEmail
  @Unique
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare email: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare password: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare role: 'admin' | 'user';

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare lastLogin: Date;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare isActive: boolean;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
  })
  declare failedLoginAttempts: number;

  @CreatedAt
  @Column
  declare createdAt: Date;

  @UpdatedAt
  @Column
  declare updatedAt: Date;

  // Password hashing before save
  @BeforeCreate
  @BeforeUpdate
  static async hashPassword(instance: User): Promise<void> {
    if (instance.changed('password')) {
      instance.password = await argon2.hash(instance.password);
    }
  }

  // Instance method to verify password
  async verifyPassword(candidatePassword: string): Promise<boolean> {
    return await argon2.verify(this.password, candidatePassword);
  }
}
