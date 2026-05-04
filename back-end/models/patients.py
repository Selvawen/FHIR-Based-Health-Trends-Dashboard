from pydantic import BaseModel

class Patient(BaseModel):
    id: int
    name: str
    external_datasource: str #connection string, if we are using mock data, it can be a file path
    # in production we can use a parsable connection string with external id and api creds