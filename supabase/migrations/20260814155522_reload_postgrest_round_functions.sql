-- Force PostgREST to publish the round RPC signatures immediately after deploy.
notify pgrst, 'reload schema';
