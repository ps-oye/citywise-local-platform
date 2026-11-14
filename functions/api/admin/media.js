import {handleAdminMedia} from '../../../src/server/admin-media-handler.js';
export const onRequest=context=>handleAdminMedia(context.request,{env:context.env});
