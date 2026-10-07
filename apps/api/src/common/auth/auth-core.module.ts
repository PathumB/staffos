import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token.service';

/** Token primitives shared by the global guards and the auth module. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService],
  exports: [TokenService],
})
export class AuthCoreModule {}
