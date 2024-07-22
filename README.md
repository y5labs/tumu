# Tumu

[Distribution configuration](https://distribution.github.io/distribution/about/configuration/)

## Environment

```bash
# Generate keys
openssl ecparam -name prime256v1 -genkey -noout -out ./tmp/private.key
openssl ec -in ./tmp/private.key -pubout > ./tmp/public.key
openssl req -x509 -nodes -new -days 3650 -extensions v3_ca -key ./tmp/private.key -out ./tmp/ca.key -subj "/C=NZ/CN=Tumu Distribution"

# Copy to .env
```

## Test against a registry

```javascript
# Test commands pushing to a registry
# docker login -u tcoats -p password localhost:5001
docker pull ubuntu
docker tag ubuntu localhost:5001/test
docker push localhost:5001/test
docker pull localhost:5001/test
```
