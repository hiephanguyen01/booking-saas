// `@Injectable()` and `@Inject()` write metadata through the Reflect API that
// Nest polyfills at bootstrap. A unit test never boots Nest, so it loads the
// polyfill itself — without it every decorated use-case throws on import.
import 'reflect-metadata';
