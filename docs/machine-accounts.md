# Machine accounts

Machine accounts are credentials for automation: a CI pipeline that pushes images, or a server that pulls them. They log in with `docker login` like a person would, but they belong to a repository instead of a user, so the pipeline keeps working when team members come and go.

There are two kinds:

- **Repository accounts** belong to one repository. Repository admins and system admins create them in the repository's settings, as described below. They can pull from their repository and, if you allow it, push to it.
- **Host accounts** are for deploy hosts that pull from several repositories. System administrators manage them; they do not appear in repository settings.

A repository account has no access beyond its own repository: elsewhere it gets no more than an anonymous client would. It cannot delete images or tags, and its secret works only for registry logins, not for the portal or the JSON API.

## Create a machine account

You need the **admin** role on the repository (or the system admin role).

1. Open the repository in the portal and choose **Settings**, then the **Access** tab.
2. In **Machine accounts**, choose **Create machine account**.
3. Enter a name: lowercase letters, digits and hyphens, 2 to 63 characters, starting with a letter. The name must be unique within the repository.
4. Optionally add a description, for example the pipeline that uses the account.
5. Choose the permissions: **Pull**, **Push**, or both. At least one is required.
6. Choose **Create**.

Berth shows the **secret** and a ready-to-paste login command once. Copy the secret into your CI secret store right away. Berth stores only a hash of it and cannot show it again. If you lose it, delete the account and create a new one.

The account's **username** is `<repository>+<name>`, for example `my-repo+ci-push`. The username is informational: the secret alone identifies the account, so a wrong username does not matter, and a deleted account's secret stops working immediately.

## Log in with `docker login`

Pipe the secret to `docker login` so it does not end up in your shell history or process list:

```bash
echo '<your machine account secret>' | docker login registry.example.com -u 'my-repo+ci-push' --password-stdin
```

Use the same host and port as the portal. Berth's create dialog fills in the host you are browsing from.

Then push or pull under the repository's name:

```bash
docker tag my-app:latest registry.example.com/my-repo/my-app:latest
docker push registry.example.com/my-repo/my-app:latest
```

**The repository must exist before the first push.** Create it in the portal first; pushing to a repository name that does not exist is rejected, and a machine account cannot create repositories. Images inside an existing repository (`my-repo/my-app`) are created by the first push.

## Use it in GitHub Actions

Store the secret as a repository or organization secret (for example `BERTH_SECRET`) in GitHub, never in the workflow file, and log in with `docker/login-action`:

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: registry.example.com
          username: my-repo+ci-push
          password: ${{ secrets.BERTH_SECRET }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: registry.example.com/my-repo/my-app:latest
```

The same pattern works for any CI system: keep the secret in the system's secret store and pass it to `docker login --password-stdin`.

## Deploy hosts

On a server that only pulls images, create an account with **Pull** only and log in once with the command above. Docker stores the credentials in `~/.docker/config.json` on that host; protect that file like any other secret.

## Delete a machine account

In **Machine accounts**, choose the trash icon next to the account and confirm. Logins with its secret fail immediately. A registry token issued just before the deletion stays valid until it expires (`TOKEN_TTL_SECONDS`, 5 minutes by default); after that the client can no longer get a new one.

Deleting a repository also deletes its machine accounts.
